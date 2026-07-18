package telemetry

import (
	"context"
	"errors"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type PublishResult struct {
	Duplicate bool
}

type Publisher interface {
	Publish(context.Context, Event) (PublishResult, error)
}

type NoopPublisher struct{}

func (NoopPublisher) Publish(context.Context, Event) (PublishResult, error) {
	return PublishResult{}, nil
}

type Clock interface {
	Now() time.Time
}

type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now().UTC() }

type Collector struct {
	publisher  Publisher
	hmacKey    []byte
	keyVersion string
	clock      Clock
}

func NewCollector(publisher Publisher, hmacKey []byte, keyVersion string, clock Clock) fiber.Handler {
	collector := &Collector{
		publisher:  publisher,
		hmacKey:    append([]byte(nil), hmacKey...),
		keyVersion: keyVersion,
		clock:      clock,
	}
	return collector.Handle
}

func (c *Collector) Handle(ctx fiber.Ctx) error {
	actorID, role, err := authenticatedActor(ctx)
	if err != nil {
		return ctx.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var batch Batch
	if err := ctx.Bind().JSON(&batch); err != nil {
		return ctx.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid_json"})
	}
	if len(batch.Events) == 0 || len(batch.Events) > MaxBatchEvents {
		return ctx.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid_batch_size"})
	}

	accepted := 0
	duplicates := 0
	rejected := 0
	for _, incoming := range batch.Events {
		event := incoming
		event.ActorID = Pseudonym(c.hmacKey, c.keyVersion, actorID)
		event.ActorRole = role
		event.ReceivedAt = c.clock.Now().UTC()
		if err := ValidateEvent(event); err != nil {
			rejected++
			continue
		}
		result, err := c.publisher.Publish(context.Background(), event)
		if err != nil {
			return ctx.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "telemetry_unavailable"})
		}
		if result.Duplicate {
			duplicates++
			continue
		}
		accepted++
	}

	return ctx.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"accepted":   accepted,
		"duplicates": duplicates,
		"rejected":   rejected,
	})
}

func authenticatedActor(ctx fiber.Ctx) (uuid.UUID, string, error) {
	userID, ok := ctx.Locals("userID").(string)
	if !ok {
		return uuid.Nil, "", errors.New("missing user ID")
	}
	actorID, err := uuid.Parse(userID)
	if err != nil {
		return uuid.Nil, "", err
	}
	token, ok := ctx.Locals("user").(*jwt.Token)
	if !ok {
		return uuid.Nil, "", errors.New("missing token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return uuid.Nil, "", errors.New("invalid claims")
	}
	role, ok := claims["role"].(string)
	if !ok || (role != "student" && role != "teacher" && role != "admin") {
		return uuid.Nil, "", errors.New("invalid role")
	}
	return actorID, role, nil
}
