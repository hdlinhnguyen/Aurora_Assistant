package main

import (
	"context"
	"io"
	"log"
	"testing"

	"backend/internal/mastery"
	"backend/internal/model"
	"backend/internal/syntheticseed"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeSyntheticSeeder struct {
	calls  int
	result syntheticseed.Result
}

func (f *fakeSyntheticSeeder) ResetAndSeed(context.Context) (syntheticseed.Result, error) {
	f.calls++
	return f.result, nil
}

type fakeMasteryRecalculator struct{ students []uuid.UUID }

func (f *fakeMasteryRecalculator) RecalculateStudent(_ context.Context, studentID uuid.UUID, _ string) (mastery.Profile, error) {
	f.students = append(f.students, studentID)
	return mastery.Profile{StudentID: studentID, Topics: map[string]mastery.TopicState{"topic": {}}}, nil
}

func TestRunSyntheticSeedSkipsWhenDisabled(t *testing.T) {
	seeder := &fakeSyntheticSeeder{}
	recalculator := &fakeMasteryRecalculator{}

	require.NoError(t, runSyntheticSeed(context.Background(), "false", seeder, recalculator, log.New(io.Discard, "", 0)))
	require.Zero(t, seeder.calls)
	require.Empty(t, recalculator.students)
}

func TestRunSyntheticSeedRecalculatesEveryStudent(t *testing.T) {
	students := []model.User{{ID: uuid.New()}, {ID: uuid.New()}, {ID: uuid.New()}}
	seeder := &fakeSyntheticSeeder{result: syntheticseed.Result{Subject: "Synthetic", Students: students}}
	recalculator := &fakeMasteryRecalculator{}

	require.NoError(t, runSyntheticSeed(context.Background(), "true", seeder, recalculator, log.New(io.Discard, "", 0)))
	require.Equal(t, []uuid.UUID{students[0].ID, students[1].ID, students[2].ID}, recalculator.students)
}
