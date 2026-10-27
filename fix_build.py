import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

# Add imports
if 'import kotlinx.coroutines.launch' not in content:
    content = content.replace('import androidx.compose.ui.unit.IntSize', 'import androidx.compose.ui.unit.IntSize\nimport kotlinx.coroutines.launch\nimport androidx.compose.ui.platform.LocalDensity')

# Fix density and toPx
content = content.replace('val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()', 'val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()\n    val density = androidx.compose.ui.platform.LocalDensity.current.density')
content = content.replace('25.dp.toPx()', '(25f * density)')

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(content)

with open('app/src/main/java/com/example/render3d/Camera3D.kt', 'r') as f:
    content2 = f.read()
content2 = content2.replace('physics.altitudeFeet()', 'physics.altitudeFeet')
with open('app/src/main/java/com/example/render3d/Camera3D.kt', 'w') as f:
    f.write(content2)

