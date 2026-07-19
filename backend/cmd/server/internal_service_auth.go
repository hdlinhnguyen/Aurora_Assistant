package main

import (
	"crypto/subtle"

	"github.com/gofiber/fiber/v3"
)

func internalServiceAuth(expected string) fiber.Handler {
	return func(c fiber.Ctx) error {
		provided := c.Get("X-Internal-Token")
		if expected == "" {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "internal service token is not configured"})
		}
		if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}
		return c.Next()
	}
}
