package adminmetrics

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"

	"gorm.io/gorm"
)

const outlierThresholdSeconds = 300.0

type Service struct{ db *gorm.DB }

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

type aggregateRow struct {
	FactCount             int64
	ActiveLearningMinutes float64
	Sessions              int64
	QuestionsAnswered     int64
	AccuracyRate          sql.NullFloat64
	AvgSolveTimeSeconds   sql.NullFloat64
	HintsPerQuestion      sql.NullFloat64
	CompletionRate        sql.NullFloat64
	AbandonmentRate       sql.NullFloat64
	MetricEventCount      int64
	MasteryTransitions    int64
	APIRequests           int64
	APIErrorRate          sql.NullFloat64
	APIP95LatencyMS       sql.NullFloat64
}

func (s *Service) Dashboard(ctx context.Context, now time.Time, r Range) (Dashboard, error) {
	if _, err := ParseRange(string(r)); err != nil {
		return Dashboard{}, err
	}
	now = now.UTC()
	currentStart := now.Add(-r.Duration())
	previousStart := currentStart.Add(-r.Duration())

	current, err := s.aggregate(ctx, currentStart, now)
	if err != nil {
		return Dashboard{}, err
	}
	previous, err := s.aggregate(ctx, previousStart, currentStart)
	if err != nil {
		return Dashboard{}, err
	}

	result := Dashboard{
		Range:       r,
		GeneratedAt: now,
		HasData:     current.FactCount > 0 || current.MetricEventCount > 0,
		Summary:     summaryFromRow(current),
		Comparison:  comparisons(summaryFromRow(current), summaryFromRow(previous)),
		Trends:      []TrendPoint{},
		EDA: EDA{
			OutlierThresholdSeconds:    outlierThresholdSeconds,
			SolveTimeDistribution:      []DistributionPoint{},
			HintDistribution:           []DistributionPoint{},
			TopicBreakdown:             []TopicMetric{},
			SourceBreakdown:            []SourceMetric{},
			MasteryTransitionBreakdown: []MasteryTransitionMetric{},
			QualityFlags:               []QualityFlag{},
		},
	}
	if !result.HasData {
		return result, nil
	}

	result.Trends, err = s.trends(ctx, currentStart, now)
	if err != nil {
		return Dashboard{}, err
	}
	result.EDA, err = s.eda(ctx, currentStart, now)
	if err != nil {
		return Dashboard{}, err
	}
	return result, nil
}

func (s *Service) aggregate(ctx context.Context, start, end time.Time) (aggregateRow, error) {
	var learning aggregateRow
	err := s.db.WithContext(ctx).Raw(`
		WITH facts AS (
			SELECT * FROM question_attempt_facts
			WHERE COALESCE(submitted_at, presented_at) >= ?
			  AND COALESCE(submitted_at, presented_at) < ?
		)
		SELECT COUNT(*) AS fact_count,
		       COALESCE(SUM(active_time_ms), 0) / 60000.0 AS active_learning_minutes,
		       COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS sessions,
		       COUNT(*) FILTER (WHERE submitted_at IS NOT NULL) AS questions_answered,
		       AVG(CASE WHEN is_correct IS NOT NULL THEN is_correct::int::double precision END) AS accuracy_rate,
		       AVG(active_time_ms / 1000.0) FILTER (WHERE submitted_at IS NOT NULL AND active_time_ms > 0) AS avg_solve_time_seconds,
		       SUM(hint_count)::double precision / NULLIF(COUNT(*), 0) AS hints_per_question,
		       COUNT(*) FILTER (WHERE submitted_at IS NOT NULL AND presented_at IS NOT NULL)::double precision
		         / NULLIF(COUNT(*) FILTER (WHERE presented_at IS NOT NULL), 0) AS completion_rate,
		       COUNT(*) FILTER (WHERE abandoned AND submitted_at IS NULL AND presented_at IS NOT NULL)::double precision
		         / NULLIF(COUNT(*) FILTER (WHERE presented_at IS NOT NULL), 0) AS abandonment_rate
		FROM facts`, start, end).Scan(&learning).Error
	if err != nil {
		return aggregateRow{}, fmt.Errorf("aggregate learning metrics: %w", err)
	}

	var events aggregateRow
	err = s.db.WithContext(ctx).Raw(`
		WITH events AS (
			SELECT event_name, properties_json
			FROM telemetry_events
			WHERE occurred_at >= ? AND occurred_at < ?
			  AND event_name IN ('api_request_completed', 'mastery_status_changed')
		), api AS (
			SELECT properties_json,
			       CASE WHEN jsonb_typeof(properties_json -> 'duration_ms') = 'number'
			                  AND (properties_json ->> 'duration_ms')::double precision >= 0
			            THEN (properties_json ->> 'duration_ms')::double precision END AS duration_ms
			FROM events WHERE event_name = 'api_request_completed'
		)
		SELECT (SELECT COUNT(*) FROM events) AS metric_event_count,
		       (SELECT COUNT(*) FROM events WHERE event_name = 'mastery_status_changed') AS mastery_transitions,
		       (SELECT COUNT(*) FROM api) AS api_requests,
		       (SELECT COUNT(*) FILTER (WHERE properties_json ->> 'status_class' IN ('4xx','5xx','network_error'))::double precision / NULLIF(COUNT(*), 0) FROM api) AS api_error_rate,
		       (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM api WHERE duration_ms IS NOT NULL) AS api_p95_latency_ms`, start, end).Scan(&events).Error
	if err != nil {
		return aggregateRow{}, fmt.Errorf("aggregate telemetry metrics: %w", err)
	}

	learning.MetricEventCount = events.MetricEventCount
	learning.MasteryTransitions = events.MasteryTransitions
	learning.APIRequests = events.APIRequests
	learning.APIErrorRate = events.APIErrorRate
	learning.APIP95LatencyMS = events.APIP95LatencyMS
	return learning, nil
}

type dailyLearningRow struct {
	Day                   time.Time
	ActiveLearningMinutes float64
	Sessions              int64
	QuestionsAnswered     int64
	AccuracyRate          sql.NullFloat64
	AvgSolveTimeSeconds   sql.NullFloat64
	HintsPerQuestion      sql.NullFloat64
	CompletionRate        sql.NullFloat64
	AbandonmentRate       sql.NullFloat64
}

type dailyEventRow struct {
	Day                time.Time
	MasteryTransitions int64
	APIRequests        int64
	APIErrorRate       sql.NullFloat64
	APIP95LatencyMS    sql.NullFloat64
}

func (s *Service) trends(ctx context.Context, start, end time.Time) ([]TrendPoint, error) {
	var learning []dailyLearningRow
	err := s.db.WithContext(ctx).Raw(`
		WITH facts AS (
			SELECT *, date_trunc('day', COALESCE(submitted_at, presented_at) AT TIME ZONE 'UTC') AS day
			FROM question_attempt_facts
			WHERE COALESCE(submitted_at, presented_at) >= ? AND COALESCE(submitted_at, presented_at) < ?
		)
		SELECT day,
		       COALESCE(SUM(active_time_ms), 0) / 60000.0 AS active_learning_minutes,
		       COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS sessions,
		       COUNT(*) FILTER (WHERE submitted_at IS NOT NULL) AS questions_answered,
		       AVG(CASE WHEN is_correct IS NOT NULL THEN is_correct::int::double precision END) AS accuracy_rate,
		       AVG(active_time_ms / 1000.0) FILTER (WHERE submitted_at IS NOT NULL AND active_time_ms > 0) AS avg_solve_time_seconds,
		       SUM(hint_count)::double precision / NULLIF(COUNT(*), 0) AS hints_per_question,
		       COUNT(*) FILTER (WHERE submitted_at IS NOT NULL AND presented_at IS NOT NULL)::double precision / NULLIF(COUNT(*) FILTER (WHERE presented_at IS NOT NULL), 0) AS completion_rate,
		       COUNT(*) FILTER (WHERE abandoned AND submitted_at IS NULL AND presented_at IS NOT NULL)::double precision / NULLIF(COUNT(*) FILTER (WHERE presented_at IS NOT NULL), 0) AS abandonment_rate
		FROM facts GROUP BY day ORDER BY day`, start, end).Scan(&learning).Error
	if err != nil {
		return nil, fmt.Errorf("daily learning metrics: %w", err)
	}

	var events []dailyEventRow
	err = s.db.WithContext(ctx).Raw(`
		WITH events AS (
			SELECT date_trunc('day', occurred_at AT TIME ZONE 'UTC') AS day, event_name, properties_json
			FROM telemetry_events
			WHERE occurred_at >= ? AND occurred_at < ? AND event_name IN ('api_request_completed','mastery_status_changed')
		), grouped AS (
			SELECT day,
			       COUNT(*) FILTER (WHERE event_name = 'mastery_status_changed') AS mastery_transitions,
			       COUNT(*) FILTER (WHERE event_name = 'api_request_completed') AS api_requests,
			       COUNT(*) FILTER (WHERE event_name = 'api_request_completed' AND properties_json ->> 'status_class' IN ('4xx','5xx','network_error'))::double precision
			         / NULLIF(COUNT(*) FILTER (WHERE event_name = 'api_request_completed'), 0) AS api_error_rate
			FROM events GROUP BY day
		), latency AS (
			SELECT day, percentile_cont(0.95) WITHIN GROUP (ORDER BY (properties_json ->> 'duration_ms')::double precision) AS api_p95_latency_ms
			FROM events
			WHERE event_name = 'api_request_completed'
			  AND jsonb_typeof(properties_json -> 'duration_ms') = 'number'
			  AND (properties_json ->> 'duration_ms')::double precision >= 0
			GROUP BY day
		)
		SELECT grouped.*, latency.api_p95_latency_ms FROM grouped LEFT JOIN latency USING (day) ORDER BY day`, start, end).Scan(&events).Error
	if err != nil {
		return nil, fmt.Errorf("daily telemetry metrics: %w", err)
	}

	points := map[string]TrendPoint{}
	for cursor := start.Truncate(day); cursor.Before(end); cursor = cursor.Add(day) {
		key := cursor.Format("2006-01-02")
		points[key] = TrendPoint{Date: key}
	}
	for _, row := range learning {
		key := row.Day.UTC().Format("2006-01-02")
		point := points[key]
		point.Date = key
		point.ActiveLearningMinutes = row.ActiveLearningMinutes
		point.Sessions = row.Sessions
		point.QuestionsAnswered = row.QuestionsAnswered
		point.AccuracyRate = nullableFloat(row.AccuracyRate)
		point.AvgSolveTimeSeconds = nullableFloat(row.AvgSolveTimeSeconds)
		point.HintsPerQuestion = nullableFloat(row.HintsPerQuestion)
		point.CompletionRate = nullableFloat(row.CompletionRate)
		point.AbandonmentRate = nullableFloat(row.AbandonmentRate)
		points[key] = point
	}
	for _, row := range events {
		key := row.Day.UTC().Format("2006-01-02")
		point := points[key]
		point.Date = key
		point.MasteryTransitions = row.MasteryTransitions
		point.APIRequests = row.APIRequests
		point.APIErrorRate = nullableFloat(row.APIErrorRate)
		point.APIP95LatencyMS = nullableFloat(row.APIP95LatencyMS)
		points[key] = point
	}
	result := make([]TrendPoint, 0, len(points))
	for _, point := range points {
		result = append(result, point)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Date < result[j].Date })
	return result, nil
}

func (s *Service) eda(ctx context.Context, start, end time.Time) (EDA, error) {
	result := EDA{
		OutlierThresholdSeconds:    outlierThresholdSeconds,
		SolveTimeDistribution:      []DistributionPoint{},
		HintDistribution:           []DistributionPoint{},
		TopicBreakdown:             []TopicMetric{},
		SourceBreakdown:            []SourceMetric{},
		MasteryTransitionBreakdown: []MasteryTransitionMetric{},
		QualityFlags:               []QualityFlag{},
	}
	var timing struct {
		MissingPresented    int64
		MissingGrade        int64
		OutlierAttemptCount int64
		P50SolveTimeSeconds sql.NullFloat64
		P95SolveTimeSeconds sql.NullFloat64
	}
	err := s.db.WithContext(ctx).Raw(`
		WITH facts AS (
			SELECT * FROM question_attempt_facts
			WHERE COALESCE(submitted_at, presented_at) >= ? AND COALESCE(submitted_at, presented_at) < ?
		), timing AS (
			SELECT active_time_ms / 1000.0 AS seconds FROM facts WHERE submitted_at IS NOT NULL AND active_time_ms > 0
		)
		SELECT (SELECT COUNT(*) FROM facts WHERE (submitted_at IS NOT NULL OR abandoned) AND presented_at IS NULL) AS missing_presented,
		       (SELECT COUNT(*) FROM facts WHERE submitted_at IS NOT NULL AND is_correct IS NULL) AS missing_grade,
		       (SELECT COUNT(*) FROM timing WHERE seconds > 300) AS outlier_attempt_count,
		       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds) FROM timing) AS p50_solve_time_seconds,
		       (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY seconds) FROM timing) AS p95_solve_time_seconds`, start, end).Scan(&timing).Error
	if err != nil {
		return EDA{}, fmt.Errorf("timing eda: %w", err)
	}
	result.MissingPresented = timing.MissingPresented
	result.MissingGrade = timing.MissingGrade
	result.OutlierAttemptCount = timing.OutlierAttemptCount
	result.P50SolveTimeSeconds = nullableFloat(timing.P50SolveTimeSeconds)
	result.P95SolveTimeSeconds = nullableFloat(timing.P95SolveTimeSeconds)

	if err := s.scanDistributions(ctx, start, end, &result); err != nil {
		return EDA{}, err
	}
	if err := s.scanBreakdowns(ctx, start, end, &result); err != nil {
		return EDA{}, err
	}
	if err := s.scanQualityFlags(ctx, start, end, &result); err != nil {
		return EDA{}, err
	}
	return result, nil
}

func (s *Service) scanDistributions(ctx context.Context, start, end time.Time, result *EDA) error {
	if err := s.db.WithContext(ctx).Raw(`
		WITH values AS (
			SELECT active_time_ms / 1000.0 AS seconds FROM question_attempt_facts
			WHERE COALESCE(submitted_at, presented_at) >= ? AND COALESCE(submitted_at, presented_at) < ?
			  AND submitted_at IS NOT NULL AND active_time_ms > 0
		)
		SELECT CASE WHEN seconds < 15 THEN '0-15s' WHEN seconds < 30 THEN '15-30s' WHEN seconds < 60 THEN '30-60s'
		            WHEN seconds < 120 THEN '60-120s' WHEN seconds <= 300 THEN '120-300s' ELSE '300s+' END AS bucket,
		       COUNT(*) AS count
		FROM values GROUP BY bucket`, start, end).Scan(&result.SolveTimeDistribution).Error; err != nil {
		return fmt.Errorf("solve time distribution: %w", err)
	}
	if err := s.db.WithContext(ctx).Raw(`
		SELECT CASE WHEN hint_count = 0 THEN '0' WHEN hint_count = 1 THEN '1' WHEN hint_count = 2 THEN '2' ELSE '3+' END AS bucket,
		       COUNT(*) AS count
		FROM question_attempt_facts
		WHERE COALESCE(submitted_at, presented_at) >= ? AND COALESCE(submitted_at, presented_at) < ?
		GROUP BY bucket`, start, end).Scan(&result.HintDistribution).Error; err != nil {
		return fmt.Errorf("hint distribution: %w", err)
	}
	sortDistribution(result.SolveTimeDistribution, []string{"0-15s", "15-30s", "30-60s", "60-120s", "120-300s", "300s+"})
	sortDistribution(result.HintDistribution, []string{"0", "1", "2", "3+"})
	return nil
}

func (s *Service) scanBreakdowns(ctx context.Context, start, end time.Time, result *EDA) error {
	type topicRow struct {
		TopicID             string
		TopicName           string
		Attempts            int64
		AccuracyRate        sql.NullFloat64
		AvgSolveTimeSeconds sql.NullFloat64
		HintsPerQuestion    sql.NullFloat64
	}
	var topics []topicRow
	if err := s.db.WithContext(ctx).Raw(`
		WITH facts AS (
			SELECT * FROM question_attempt_facts
			WHERE COALESCE(submitted_at, presented_at) >= ? AND COALESCE(submitted_at, presented_at) < ? AND topic_id <> ''
		)
		SELECT facts.topic_id, COALESCE(NULLIF(nodes.name, ''), facts.topic_id) AS topic_name,
		       COUNT(*) AS attempts,
		       AVG(CASE WHEN facts.is_correct IS NOT NULL THEN facts.is_correct::int::double precision END) AS accuracy_rate,
		       AVG(facts.active_time_ms / 1000.0) FILTER (WHERE facts.submitted_at IS NOT NULL AND facts.active_time_ms > 0) AS avg_solve_time_seconds,
		       SUM(facts.hint_count)::double precision / NULLIF(COUNT(*), 0) AS hints_per_question
		FROM facts LEFT JOIN nodes ON nodes.id::text = facts.topic_id
		GROUP BY facts.topic_id, nodes.name ORDER BY attempts DESC, facts.topic_id ASC LIMIT 20`, start, end).Scan(&topics).Error; err != nil {
		return fmt.Errorf("topic breakdown: %w", err)
	}
	for _, row := range topics {
		result.TopicBreakdown = append(result.TopicBreakdown, TopicMetric{TopicID: row.TopicID, TopicName: row.TopicName, Attempts: row.Attempts, AccuracyRate: nullableFloat(row.AccuracyRate), AvgSolveTimeSeconds: nullableFloat(row.AvgSolveTimeSeconds), HintsPerQuestion: nullableFloat(row.HintsPerQuestion)})
	}
	if err := s.db.WithContext(ctx).Raw(`SELECT source, COUNT(*) AS events FROM telemetry_events WHERE occurred_at >= ? AND occurred_at < ? GROUP BY source ORDER BY events DESC, source ASC`, start, end).Scan(&result.SourceBreakdown).Error; err != nil {
		return fmt.Errorf("source breakdown: %w", err)
	}
	if err := s.db.WithContext(ctx).Raw(`
		SELECT properties_json ->> 'status_before' AS "from", properties_json ->> 'status_after' AS "to", COUNT(*) AS count
		FROM telemetry_events
		WHERE occurred_at >= ? AND occurred_at < ? AND event_name = 'mastery_status_changed'
		  AND jsonb_typeof(properties_json -> 'status_before') = 'string' AND jsonb_typeof(properties_json -> 'status_after') = 'string'
		GROUP BY "from", "to" ORDER BY count DESC, "from" ASC, "to" ASC LIMIT 20`, start, end).Scan(&result.MasteryTransitionBreakdown).Error; err != nil {
		return fmt.Errorf("mastery transition breakdown: %w", err)
	}
	return nil
}

func (s *Service) scanQualityFlags(ctx context.Context, start, end time.Time, result *EDA) error {
	var invalidDuration int64
	if err := s.db.WithContext(ctx).Raw(`
		SELECT COUNT(*) FROM telemetry_events
		WHERE occurred_at >= ? AND occurred_at < ? AND event_name = 'api_request_completed'
		  AND (jsonb_typeof(properties_json -> 'duration_ms') IS DISTINCT FROM 'number'
		       OR (properties_json ->> 'duration_ms')::double precision < 0)`, start, end).Scan(&invalidDuration).Error; err != nil {
		return fmt.Errorf("invalid API duration: %w", err)
	}
	result.InvalidDuration = invalidDuration

	var rawFlags []QualityFlag
	if err := s.db.WithContext(ctx).Raw(`
		SELECT flag, COUNT(*) AS count
		FROM question_attempt_facts,
		     LATERAL jsonb_array_elements_text(COALESCE(quality_flags_json, '[]'::jsonb)) AS flag
		WHERE COALESCE(submitted_at, presented_at) >= ? AND COALESCE(submitted_at, presented_at) < ?
		GROUP BY flag`, start, end).Scan(&rawFlags).Error; err != nil {
		return fmt.Errorf("fact quality flags: %w", err)
	}
	var missingTimestamp int64
	if err := s.db.WithContext(ctx).Raw(`SELECT COUNT(*) FROM question_attempt_facts WHERE presented_at IS NULL AND submitted_at IS NULL AND updated_at >= ? AND updated_at < ?`, start, end).Scan(&missingTimestamp).Error; err != nil {
		return fmt.Errorf("missing fact timestamp: %w", err)
	}
	counts := map[string]int64{}
	for _, flag := range rawFlags {
		counts[flag.Flag] += flag.Count
	}
	counts["missing_presented"] += result.MissingPresented
	counts["missing_grade"] += result.MissingGrade
	counts["missing_timestamp"] += missingTimestamp
	counts["invalid_duration"] += result.InvalidDuration
	for flag, count := range counts {
		if count > 0 {
			result.QualityFlags = append(result.QualityFlags, QualityFlag{Flag: flag, Count: count})
		}
	}
	sort.Slice(result.QualityFlags, func(i, j int) bool {
		if result.QualityFlags[i].Count == result.QualityFlags[j].Count {
			return result.QualityFlags[i].Flag < result.QualityFlags[j].Flag
		}
		return result.QualityFlags[i].Count > result.QualityFlags[j].Count
	})
	return nil
}

func summaryFromRow(row aggregateRow) Summary {
	return Summary{
		ActiveLearningMinutes: row.ActiveLearningMinutes,
		Sessions:              row.Sessions, QuestionsAnswered: row.QuestionsAnswered,
		AccuracyRate: nullableFloat(row.AccuracyRate), AvgSolveTimeSeconds: nullableFloat(row.AvgSolveTimeSeconds),
		HintsPerQuestion: nullableFloat(row.HintsPerQuestion), CompletionRate: nullableFloat(row.CompletionRate), AbandonmentRate: nullableFloat(row.AbandonmentRate),
		MasteryTransitions: row.MasteryTransitions, APIRequests: row.APIRequests, APIErrorRate: nullableFloat(row.APIErrorRate), APIP95LatencyMS: nullableFloat(row.APIP95LatencyMS),
	}
}

func comparisons(current, previous Summary) map[string]ComparisonValue {
	return map[string]ComparisonValue{
		"activeLearningMinutes": compare(floatValue(current.ActiveLearningMinutes), floatValue(previous.ActiveLearningMinutes)),
		"sessions":              compare(floatValue(float64(current.Sessions)), floatValue(float64(previous.Sessions))),
		"questionsAnswered":     compare(floatValue(float64(current.QuestionsAnswered)), floatValue(float64(previous.QuestionsAnswered))),
		"accuracyRate":          compare(current.AccuracyRate, previous.AccuracyRate),
		"avgSolveTimeSeconds":   compare(current.AvgSolveTimeSeconds, previous.AvgSolveTimeSeconds),
		"hintsPerQuestion":      compare(current.HintsPerQuestion, previous.HintsPerQuestion),
		"completionRate":        compare(current.CompletionRate, previous.CompletionRate),
		"abandonmentRate":       compare(current.AbandonmentRate, previous.AbandonmentRate),
		"masteryTransitions":    compare(floatValue(float64(current.MasteryTransitions)), floatValue(float64(previous.MasteryTransitions))),
		"apiRequests":           compare(floatValue(float64(current.APIRequests)), floatValue(float64(previous.APIRequests))),
		"apiErrorRate":          compare(current.APIErrorRate, previous.APIErrorRate),
		"apiP95LatencyMs":       compare(current.APIP95LatencyMS, previous.APIP95LatencyMS),
	}
}

func compare(current, previous *float64) ComparisonValue {
	return ComparisonValue{Current: current, Previous: previous, DeltaPercent: percentDelta(current, previous)}
}

func floatValue(value float64) *float64 { return &value }

func nullableFloat(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	return floatValue(value.Float64)
}

func sortDistribution(values []DistributionPoint, order []string) {
	positions := make(map[string]int, len(order))
	for index, value := range order {
		positions[value] = index
	}
	sort.Slice(values, func(i, j int) bool { return positions[values[i].Bucket] < positions[values[j].Bucket] })
}
