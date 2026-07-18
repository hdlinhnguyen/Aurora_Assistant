package syntheticseed

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGrade7TargetsContainCompleteNumberAndAlgebraSet(t *testing.T) {
	require.ElementsMatch(t, []string{
		"l7-so-huu-ti-khai-niem",
		"l7-phep-tinh-so-huu-ti",
		"l7-can-bac-hai",
		"l7-so-thuc",
		"l7-ti-le-thuc",
		"l7-dai-luong-ti-le",
		"l7-bieu-thuc-dai-so",
		"l7-da-thuc-mot-bien",
	}, grade7TargetKeys())
}

func TestCurriculumClosureIncludesCrossGradePrerequisitesWithoutDanglingEdges(t *testing.T) {
	closure, err := resolveCurriculumClosure(syntheticCurriculumCatalog(), grade7TargetKeys())
	require.NoError(t, err)
	require.Len(t, closure.Targets, 8)
	require.Greater(t, len(closure.Topics), len(closure.Targets))
	for _, edge := range closure.Edges {
		require.Contains(t, closure.ByStableKey, edge.SourceKey)
		require.Contains(t, closure.ByStableKey, edge.TargetKey)
		require.NotEqual(t, edge.SourceKey, edge.TargetKey)
	}
	for _, topic := range closure.Topics {
		require.NotContains(t, strings.ToLower(topic.Strand), "hình học")
	}
}

func TestCurriculumClosureRejectsMissingPrerequisiteAndCycles(t *testing.T) {
	_, err := resolveCurriculumClosure([]curriculumTopic{
		{StableKey: "target", Prerequisites: []string{"missing"}},
	}, []string{"target"})
	require.ErrorContains(t, err, "missing prerequisite")

	_, err = resolveCurriculumClosure([]curriculumTopic{
		{StableKey: "a", Prerequisites: []string{"b"}},
		{StableKey: "b", Prerequisites: []string{"a"}},
	}, []string{"a"})
	require.ErrorContains(t, err, "cycle")
}
