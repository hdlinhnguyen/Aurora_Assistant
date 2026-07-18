package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"backend/internal/config"
	"backend/internal/telemetry"
)

func main() {
	fromText := flag.String("from", "", "inclusive RFC3339 start time")
	toText := flag.String("to", "", "exclusive RFC3339 end time")
	purgeDays := flag.Int("purge-interactions-older-than-days", 0, "delete old raw interaction events after rebuild")
	flag.Parse()

	from, err := time.Parse(time.RFC3339, *fromText)
	if err != nil {
		fmt.Fprintf(os.Stderr, "invalid --from: %v\n", err)
		os.Exit(2)
	}
	to, err := time.Parse(time.RFC3339, *toText)
	if err != nil || !to.After(from) {
		fmt.Fprintf(os.Stderr, "invalid --to: %v\n", err)
		os.Exit(2)
	}

	config.ConnectDB()
	result, err := telemetry.RebuildRange(context.Background(), config.DB, from.UTC(), to.UTC())
	if err != nil {
		fmt.Fprintf(os.Stderr, "rebuild failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf(
		"attempts_upserted=%d missing_presented=%d missing_grade=%d\n",
		result.AttemptsUpserted, result.MissingPresented, result.MissingGrade,
	)
	if *purgeDays > 0 {
		cutoff := time.Now().UTC().Add(-time.Duration(*purgeDays) * 24 * time.Hour)
		deleted, err := telemetry.PurgeRawInteractions(context.Background(), config.DB, cutoff)
		if err != nil {
			fmt.Fprintf(os.Stderr, "purge failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("raw_interactions_deleted=%d cutoff=%s\n", deleted, cutoff.Format(time.RFC3339))
	}
}
