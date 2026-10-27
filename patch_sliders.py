import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

# Fix VirtualFlightStick
content = content.replace(
    'val event = awaitPointerEvent()\n                            val change = event.changes.firstOrNull { it.id == pointerId }',
    'val event = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial)\n                            val change = event.changes.firstOrNull { it.id == pointerId }'
)

# Fix TouchSliderVertical
content = content.replace(
    '''                        var isDragging = true
                        while (isDragging) {
                            val event = awaitPointerEvent()''',
    '''                        var isDragging = true
                        while (isDragging) {
                            val event = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial)'''
)

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(content)

