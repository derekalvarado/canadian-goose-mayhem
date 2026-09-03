extends Node3D

enum SandwichState { ON_GROUND, CARRIED, DELIVERED }

@onready var goose: CharacterBody3D = $Goose
@onready var sandwich: Node3D = $Sandwich
@onready var nest_zone: Area3D = $NestZone
@onready var hint_label: Label = $CanvasLayer/MarginContainer/PanelContainer/VBoxContainer/HintLabel
@onready var objective_label: Label = $CanvasLayer/MarginContainer/PanelContainer/VBoxContainer/ObjectiveLabel

var sandwich_state := SandwichState.ON_GROUND

func _ready() -> void:
	objective_label.text = "Objective: steal the sandwich and bring it back to the nest."
	hint_label.text = "Use WASD to move the goose."

func _physics_process(_delta: float) -> void:
	match sandwich_state:
		SandwichState.ON_GROUND:
			if goose.global_position.distance_to(sandwich.global_position) < 1.2:
				sandwich_state = SandwichState.CARRIED
				objective_label.text = "Nice. Waddle that sandwich back to the nest."
		SandwichState.CARRIED:
			var forward := -goose.global_transform.basis.z.normalized()
			sandwich.global_position = goose.global_position + forward * 0.8 + Vector3(0, 0.35, 0)
			sandwich.rotation.y = goose.rotation.y

			if goose.global_position.distance_to(nest_zone.global_position) < 1.5:
				sandwich_state = SandwichState.DELIVERED
				objective_label.text = "Mission complete. The goose wins snack custody."
				hint_label.text = "Round complete. You can keep waddling with WASD."
		SandwichState.DELIVERED:
			pass
