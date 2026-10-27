import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

content = re.sub(
    r'Button\(\s*onClick = \{\s*camera\.cycleCameraMode\(\)\s*\},.*?Text\([^)]+isTransitioning[^)]+\)\s*\}',
    r'''FlightMomentaryButton(
                    isActive = camera.isTransitioning,
                    onPress = { camera.cycleCameraMode() },
                    onRelease = {},
                    activeColor = Color(0xFF381E72),
                    inactiveColor = Color(0xCC1C1B1F),
                    activeTextColor = Color(0xFFD0BCFF),
                    inactiveTextColor = Color(0xFFD0BCFF),
                    modifier = Modifier.testTag("camera_mode_button").height(36.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 12.dp)) {
                        Icon(Icons.Default.CameraAlt, contentDescription = "Camera", modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = if (camera.isTransitioning) "TRANSITIONING..." else camera.mode.label,
                            fontSize = 11.sp
                        )
                    }
                }''',
    content, flags=re.DOTALL
)

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(content)

