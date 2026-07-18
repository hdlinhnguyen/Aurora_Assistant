import numpy as np

# Frame and pixel shape
ASPECT_RATIO = 16.0 / 9.0
FRAME_HEIGHT = 8.0
FRAME_WIDTH = FRAME_HEIGHT * ASPECT_RATIO
FRAME_Y_RADIUS = FRAME_HEIGHT / 2
FRAME_X_RADIUS = FRAME_WIDTH / 2

DEFAULT_PIXEL_HEIGHT = 1080
DEFAULT_PIXEL_WIDTH = 1920
DEFAULT_FPS = 30

# Buffs
SMALL_BUFF = 0.1
MED_SMALL_BUFF = 0.25
MED_LARGE_BUFF = 0.5
LARGE_BUFF = 1

DEFAULT_MOBJECT_TO_EDGE_BUFFER = MED_LARGE_BUFF    # Distance between object and edge
DEFAULT_MOBJECT_TO_MOBJECT_BUFFER = MED_SMALL_BUFF # Distance between objects

# Run times
DEFAULT_POINTWISE_FUNCTION_RUN_TIME = 3.0
DEFAULT_WAIT_TIME = 1.0

# Coordinates
# manim uses three-dimensional coordinates and uses the type of ndarray
ORIGIN = np.array((0., 0., 0.))
UP = np.array((0., 1., 0.))
DOWN = np.array((0., -1., 0.))
RIGHT = np.array((1., 0., 0.))
LEFT = np.array((-1., 0., 0.))
IN = np.array((0., 0., -1.))
OUT = np.array((0., 0., 1.))
X_AXIS = np.array((1., 0., 0.))
Y_AXIS = np.array((0., 1., 0.))
Z_AXIS = np.array((0., 0., 1.))

# Useful abbreviations for diagonals
UL = UP + LEFT
UR = UP + RIGHT
DL = DOWN + LEFT
DR = DOWN + RIGHT

TOP = FRAME_Y_RADIUS * UP
BOTTOM = FRAME_Y_RADIUS * DOWN
LEFT_SIDE = FRAME_X_RADIUS * LEFT
RIGHT_SIDE = FRAME_X_RADIUS * RIGHT

# Mathematical constant
PI = np.pi
TAU = 2 * PI
DEGREES = TAU / 360

# Text
NORMAL = "NORMAL"
ITALIC = "ITALIC"
OBLIQUE = "OBLIQUE"
BOLD = "BOLD"

# Stroke width
DEFAULT_STROKE_WIDTH = 4

# Colors (A few basic defaults - others are usually imported from manimlib directly)
WHITE = "#FFFFFF"
BLACK = "#000000"
BLUE = "#58C4DD"
TEAL = "#5CD0B3"
GREEN = "#83C167"
YELLOW = "#FFFF00"
GOLD = "#F4D345"
RED = "#FC6255"
MAROON = "#C55F73"
PURPLE = "#9A72AC"
GREY = "#888888"
