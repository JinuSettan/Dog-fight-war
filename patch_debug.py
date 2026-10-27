import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

# Add the debugHitbox modifier extension
debug_hitbox_code = """
import androidx.compose.material.icons.filled.BugReport

@Composable
fun Modifier.debugHitbox(enabled: Boolean): Modifier = if (enabled) {
    this.border(2.dp, Color.Red).background(Color(0x33FF0000))
} else {
    this
}

@Composable
fun FlightControlsOverlay"""

content = content.replace('@Composable\nfun FlightControlsOverlay', debug_hitbox_code)

# Add showDebugHitboxes state
state_code = """    val dummy = 0 // Remove frameTickState.value read to prevent full UI recomposition
    var showDebugHitboxes by remember { mutableStateOf(false) }"""

content = content.replace('val dummy = 0 // Remove frameTickState.value read to prevent full UI recomposition', state_code)

# Add toggle button
toggle_code = """                // Debug Hitboxes Toggle
                IconButton(
                    onClick = { showDebugHitboxes = !showDebugHitboxes },
                    modifier = Modifier.background(if (showDebugHitboxes) Color(0xFFB3261E) else Color(0xCC1C1B1F), CircleShape).testTag("toggle_debug_hitboxes_button")
                ) {
                    Icon(Icons.Default.BugReport, contentDescription = "Debug Hitboxes", tint = Color(0xFFE6E1E5))
                }

                // Physics Sandbox Toggle"""

content = content.replace('// Physics Sandbox Toggle', toggle_code)

# Apply .debugHitbox(showDebugHitboxes) to all buttons and sliders
# FlightMomentaryButton, FlightToggleButton, TouchSliderVertical, TouchSliderHorizontal, VirtualFlightStick, Button, IconButton

# We need to add it to their modifiers. 
# Let's do it using regex for modifier = Modifier...
content = re.sub(r'(modifier\s*=\s*Modifier[^)]*\.testTag\("[^"]+"\))', r'\1.debugHitbox(showDebugHitboxes)', content)

# But wait, Button and IconButton sometimes don't have testTags, let's just add it to all controls if we can.
# Actually, the buttons in top bar might not all have test tags. Wait, most of them do:
# camera_mode_button, toggle_real_world_map_button, toggle_minimap_button, reset_flight_button, aircraft_select_button, toggle_physics_panel_button,
# wheel_brakes_button, flaps_button, airbrake_button, landing_gear_button, flight_stick, throttle_slider, rudder_slider, afterburner_button.

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(content)

