package telemetry

type EventRule struct {
	RequiredProperties []string
}

var eventRules = map[string]EventRule{
	"learning_session_started":        {RequiredProperties: []string{"session_id"}},
	"learning_session_ended":          {RequiredProperties: []string{"session_id"}},
	"question_presented":              {RequiredProperties: []string{"question_id"}},
	"question_abandoned":              {RequiredProperties: []string{"question_id", "active_time_ms"}},
	"question_answer_submitted":       {RequiredProperties: []string{"question_id", "selected_option", "active_time_ms"}},
	"question_graded":                 {RequiredProperties: []string{"question_id", "is_correct"}},
	"hint_requested":                  {RequiredProperties: []string{"hint_level"}},
	"hint_rendered":                   {RequiredProperties: []string{"hint_level"}},
	"hint_generation_failed":          {RequiredProperties: []string{"reason"}},
	"mastery_calculated":              {RequiredProperties: []string{"subject", "topic_count", "model_version"}},
	"mastery_status_changed":          {RequiredProperties: []string{"status_before", "status_after"}},
	"learning_path_generated":         {RequiredProperties: []string{"thread_id", "path_count", "model_version"}},
	"learning_path_generation_failed": {RequiredProperties: []string{"reason"}},
	"learning_path_approved":          {RequiredProperties: []string{"thread_id", "approved"}},
	"path_step_moved":                 {RequiredProperties: []string{"thread_id", "step_index", "direction", "resulting_step_count"}},
	"path_step_deleted":               {RequiredProperties: []string{"thread_id", "step_index", "resulting_step_count"}},
	"exam_submitted":                  {RequiredProperties: []string{"exam_id", "submission_count"}},
	"exam_graded":                     {RequiredProperties: []string{"exam_id", "graded_count"}},
	"api_request_completed":           {RequiredProperties: []string{"endpoint", "method", "status_class", "duration_ms"}},
	"telemetry_rejected":              {RequiredProperties: []string{"reason"}},
}

var sensitivePropertyKeys = map[string]struct{}{
	"answer_text": {},
	"content":     {},
	"email":       {},
	"image":       {},
	"message":     {},
	"name":        {},
	"token":       {},
}
