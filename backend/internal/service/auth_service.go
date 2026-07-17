package service

import (
	"errors"
	"log"
	"time"

	"backend/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrUserExists   = errors.New("email already exists")
	ErrInvalidCreds = errors.New("invalid email or password")
	ErrHashFailed   = errors.New("failed to hash password")
	ErrTokenFailed  = errors.New("failed to generate token")
)

type AuthService interface {
	Register(email, password, name, role string) (*model.User, error)
	Login(email, password string) (*model.User, string, error)
}

type authService struct {
	db        *gorm.DB
	jwtSecret string
}

func NewAuthService(db *gorm.DB, secret string) AuthService {
	if secret == "" {
		log.Fatal("FATAL: JWT_SECRET environment variable is required.")
	}
	return &authService{
		db:        db,
		jwtSecret: secret,
	}
}

func (s *authService) Register(email, password, name, role string) (*model.User, error) {
	var count int64
	s.db.Model(&model.User{}).Where("email = ?", email).Count(&count)
	if count > 0 {
		return nil, ErrUserExists
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, ErrHashFailed
	}

	if role != "teacher" && role != "student" {
		role = "student"
	}

	user := &model.User{
		ID:       uuid.New(),
		Email:    email,
		Password: string(hashedPassword),
		Name:     name,
		Role:     role,
	}

	if err := s.db.Create(user).Error; err != nil {
		return nil, err
	}

	return user, nil
}

func (s *authService) Login(email, password string) (*model.User, string, error) {
	var user model.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		return nil, "", ErrInvalidCreds
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return nil, "", ErrInvalidCreds
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  user.ID.String(),
		"role": user.Role,
		"name": user.Name,
		"exp":  time.Now().Add(24 * time.Hour).Unix(),
	})

	t, err := token.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return nil, "", ErrTokenFailed
	}

	return &user, t, nil
}
