extends CharacterBody3D

@export var move_speed := 4.5

func _physics_process(_delta: float) -> void:
	var input_direction := Vector3.ZERO

	if Input.is_key_pressed(KEY_A):
		input_direction.x -= 1.0
	if Input.is_key_pressed(KEY_D):
		input_direction.x += 1.0
	if Input.is_key_pressed(KEY_W):
		input_direction.z -= 1.0
	if Input.is_key_pressed(KEY_S):
		input_direction.z += 1.0

	if input_direction.length() > 0.0:
		var direction := input_direction.normalized()
		velocity = Vector3(direction.x * move_speed, 0.0, direction.z * move_speed)
		look_at(global_position + direction, Vector3.UP)
	else:
		velocity = Vector3.ZERO

	move_and_slide()
