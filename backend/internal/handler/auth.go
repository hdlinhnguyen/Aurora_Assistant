package handler

import (
	"strings"

	"github.com/gofiber/fiber/v3"

	"backend/internal/service"
)

type AuthHandler struct {
	svc service.AuthService
}

func NewAuthHandler(svc service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Role     string `json:"role"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(c fiber.Ctx) error {
	var req RegisterRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Name = strings.TrimSpace(req.Name)

	if req.Email == "" || len(req.Password) < 6 || req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Thông tin không hợp lệ. Mật khẩu phải từ 6 ký tự trở lên."})
	}

	user, err := h.svc.Register(req.Email, req.Password, req.Name, req.Role)
	if err != nil {
		if err == service.ErrUserExists {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Email đã được sử dụng"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Lỗi đăng ký tài khoản"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Đăng ký thành công",
		"user": fiber.Map{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
			"role":  user.Role,
		},
	})
}

func (h *AuthHandler) Login(c fiber.Ctx) error {
	var req LoginRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	if req.Email == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Vui lòng nhập đầy đủ Email và Mật khẩu"})
	}

	user, token, err := h.svc.Login(req.Email, req.Password)
	if err != nil {
		if err == service.ErrInvalidCreds {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Email hoặc mật khẩu không chính xác"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Lỗi đăng nhập"})
	}

	return c.JSON(fiber.Map{
		"token": token,
		"user": fiber.Map{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
			"role":  user.Role,
		},
	})
}
