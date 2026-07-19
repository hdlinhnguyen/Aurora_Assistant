package handler

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"backend/internal/aicost"
	"backend/internal/model"
)

// GetMonitoringAICost trả token/chi phí LLM tích luỹ (Tầng 3 — AI Cost Control).
func (h *AdminHandler) GetMonitoringAICost(c fiber.Ctx) error {
	return c.JSON(aicost.Current())
}

type AdminHandler struct {
	db *gorm.DB
}

func NewAdminHandler(db *gorm.DB) *AdminHandler {
	return &AdminHandler{db: db}
}

type CreateTeacherRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type UpdateTeacherRequest struct {
	Name   string `json:"name"`
	Email  string `json:"email"`
	Status string `json:"status"` // "active", "pending", "inactive"
}

type CreateClassroomRequest struct {
	Name      string `json:"name"`
	TeacherID string `json:"teacherId"`
}

type UpdateClassroomRequest struct {
	Name      string `json:"name"`
	TeacherID string `json:"teacherId"`
}

// ──────────────────────────────────────────────────────────────────────
// TEACHERS CRUD
// ──────────────────────────────────────────────────────────────────────

func (h *AdminHandler) GetTeachers(c fiber.Ctx) error {
	var teachers []model.User
	if err := h.db.Where("role = ?", "teacher").Order("name asc").Find(&teachers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể lấy danh sách giáo viên: " + err.Error()})
	}
	return c.JSON(teachers)
}

func (h *AdminHandler) CreateTeacher(c fiber.Ctx) error {
	var req CreateTeacherRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	if req.Email == "" || len(req.Password) < 6 || req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Thông tin không hợp lệ. Mật khẩu ít nhất 6 ký tự"})
	}

	var count int64
	h.db.Model(&model.User{}).Where("email = ?", req.Email).Count(&count)
	if count > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Email đã tồn tại"})
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Lỗi mã hóa mật khẩu"})
	}

	teacher := model.User{
		ID:        uuid.New(),
		Email:     req.Email,
		Password:  string(hashedPassword),
		Name:      req.Name,
		Role:      "teacher",
		Status:    "active",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := h.db.Create(&teacher).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tạo tài khoản giáo viên: " + err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(teacher)
}

func (h *AdminHandler) UpdateTeacher(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID không hợp lệ"})
	}

	var req UpdateTeacherRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	var teacher model.User
	if err := h.db.First(&teacher, "id = ? AND role = ?", id, "teacher").Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Không tìm thấy giáo viên"})
	}

	if req.Name != "" {
		teacher.Name = req.Name
	}
	if req.Email != "" {
		teacher.Email = req.Email
	}
	if req.Status != "" {
		teacher.Status = req.Status
	}
	teacher.UpdatedAt = time.Now()

	if err := h.db.Save(&teacher).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể cập nhật giáo viên: " + err.Error()})
	}

	return c.JSON(teacher)
}

func (h *AdminHandler) DeleteTeacher(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID không hợp lệ"})
	}

	if err := h.db.Delete(&model.User{}, "id = ? AND role = ?", id, "teacher").Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể xóa giáo viên: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Đã xóa giáo viên thành công"})
}

// ──────────────────────────────────────────────────────────────────────
// CLASSROOMS CRUD
// ──────────────────────────────────────────────────────────────────────

func (h *AdminHandler) GetClassrooms(c fiber.Ctx) error {
	type ClassroomResponse struct {
		ID          uuid.UUID `json:"id"`
		Name        string    `json:"name"`
		TeacherID   uuid.UUID `json:"teacherId"`
		TeacherName string    `json:"teacherName"`
		CreatedAt   time.Time `json:"createdAt"`
	}

	var classrooms []model.Classroom
	if err := h.db.Find(&classrooms).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể lấy danh sách lớp học: " + err.Error()})
	}

	// Fetch all teachers to match names
	var teachers []model.User
	h.db.Where("role = ?", "teacher").Find(&teachers)
	teacherMap := make(map[uuid.UUID]string)
	for _, t := range teachers {
		teacherMap[t.ID] = t.Name
	}

	response := make([]ClassroomResponse, len(classrooms))
	for i, cls := range classrooms {
		response[i] = ClassroomResponse{
			ID:          cls.ID,
			Name:        cls.Name,
			TeacherID:   cls.TeacherID,
			TeacherName: teacherMap[cls.TeacherID],
			CreatedAt:   cls.CreatedAt,
		}
	}

	return c.JSON(response)
}

func (h *AdminHandler) CreateClassroom(c fiber.Ctx) error {
	var req CreateClassroomRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	if req.Name == "" || req.TeacherID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Tên lớp và giáo viên là bắt buộc"})
	}

	teacherID, err := uuid.Parse(req.TeacherID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID Giáo viên không hợp lệ"})
	}

	// Verify teacher exists
	var count int64
	h.db.Model(&model.User{}).Where("id = ? AND role = ?", teacherID, "teacher").Count(&count)
	if count == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Giáo viên không tồn tại"})
	}

	classroom := model.Classroom{
		ID:        uuid.New(),
		Name:      req.Name,
		TeacherID: teacherID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := h.db.Create(&classroom).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tạo lớp học: " + err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(classroom)
}

func (h *AdminHandler) UpdateClassroom(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID không hợp lệ"})
	}

	var req UpdateClassroomRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	var classroom model.Classroom
	if err := h.db.First(&classroom, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Không tìm thấy lớp học"})
	}

	if req.Name != "" {
		classroom.Name = req.Name
	}
	if req.TeacherID != "" {
		teacherID, err := uuid.Parse(req.TeacherID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID Giáo viên không hợp lệ"})
		}
		// Verify teacher exists
		var count int64
		h.db.Model(&model.User{}).Where("id = ? AND role = ?", teacherID, "teacher").Count(&count)
		if count == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Giáo viên không tồn tại"})
		}
		classroom.TeacherID = teacherID
	}
	classroom.UpdatedAt = time.Now()

	if err := h.db.Save(&classroom).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể cập nhật lớp học: " + err.Error()})
	}

	return c.JSON(classroom)
}

func (h *AdminHandler) DeleteClassroom(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID không hợp lệ"})
	}

	// Nullify ClassroomID for students in this class
	h.db.Model(&model.User{}).Where("classroom_id = ?", id).Update("classroom_id", nil)

	if err := h.db.Delete(&model.Classroom{}, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể xóa lớp học: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Đã xóa lớp học thành công"})
}
