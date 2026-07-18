package main

import (
	"context"
	"fmt"
	"log"

	"backend/internal/mastery"
	"backend/internal/syntheticseed"

	"github.com/google/uuid"
)

type syntheticSeeder interface {
	ResetAndSeed(context.Context) (syntheticseed.Result, error)
}

type masteryRecalculator interface {
	RecalculateStudent(context.Context, uuid.UUID, string) (mastery.Profile, error)
}

func runSyntheticSeed(
	ctx context.Context,
	rawFlag string,
	seeder syntheticSeeder,
	recalculator masteryRecalculator,
	logger *log.Logger,
) error {
	if !syntheticseed.Enabled(rawFlag) {
		logger.Println("synthetic data seed disabled")
		return nil
	}

	result, err := seeder.ResetAndSeed(ctx)
	if err != nil {
		return fmt.Errorf("reset synthetic data: %w", err)
	}
	topicStates := 0
	for _, student := range result.Students {
		profile, err := recalculator.RecalculateStudent(ctx, student.ID, result.Subject)
		if err != nil {
			return fmt.Errorf("recalculate synthetic student %s: %w", student.Email, err)
		}
		topicStates += len(profile.Topics)
	}
	logger.Printf(
		"synthetic data ready: users=%d nodes=%d questions=%d activities=%d mastery_topics=%d",
		1+len(result.Students), len(result.NodeIDs), result.QuestionCount, result.ActivityCount, topicStates,
	)
	return nil
}
