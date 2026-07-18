package config

import (
	"reflect"
	"testing"

	"backend/internal/model"
)

func TestMigrationModelsIncludeTelemetryStorage(t *testing.T) {
	types := map[reflect.Type]bool{}
	for _, migrationModel := range migrationModels() {
		types[reflect.TypeOf(migrationModel)] = true
	}

	for _, required := range []any{&model.TelemetryEvent{}, &model.TelemetryOutbox{}} {
		if !types[reflect.TypeOf(required)] {
			t.Fatalf("missing migration model %T", required)
		}
	}
}

func TestMigrationModelsIncludeLearningPathStepProgress(t *testing.T) {
	types := map[reflect.Type]bool{}
	for _, migrationModel := range migrationModels() {
		types[reflect.TypeOf(migrationModel)] = true
	}

	if !types[reflect.TypeOf(&model.LearningPathStepProgress{})] {
		t.Fatal("missing migration model LearningPathStepProgress")
	}
}
