import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

new_stick = """@Composable
fun VirtualFlightStick(
    onStickMove: (roll: Float, pitch: Float) -> Unit,
    modifier: Modifier = Modifier
) {
    var size by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    val offsetX = remember { androidx.compose.animation.core.Animatable(0f) }
    val offsetY = remember { androidx.compose.animation.core.Animatable(0f) }
    val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()

    androidx.compose.runtime.LaunchedEffect(Unit) {
        while (true) {
            val stickRadius = if (size.width > 0) (size.width / 2f) - 25.dp.toPx() else 1f
            val normRoll = offsetX.value / stickRadius
            val normPitch = offsetY.value / stickRadius
            onStickMove(normRoll, normPitch)
            kotlinx.coroutines.delay(16L)
        }
    }

    Box(
        modifier = modifier
            .size(160.dp)
            .background(Color(0xCC1C1B1F), CircleShape)
            .border(2.dp, Color(0x66D0BCFF), CircleShape)
            .onSizeChanged { size = it }
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while(true) {
                        val down = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial).changes.firstOrNull { it.pressed && !it.isConsumed } ?: continue
                        if (!down.isConsumed) down.consume()
                        val pointerId = down.id
                        
                        val center = Offset(size.width / 2f, size.height / 2f)
                        val stickRadius = (size.width / 2f) - 25.dp.toPx() // limit to boundary
                        
                        val computeMove = { pos: Offset ->
                            coroutineScope.launch {
                                offsetX.snapTo((pos.x - center.x).coerceIn(-stickRadius, stickRadius))
                                offsetY.snapTo((pos.y - center.y).coerceIn(-stickRadius, stickRadius))
                            }
                        }
                        computeMove(down.position)

                        var isDragging = true
                        while (isDragging) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == pointerId }
                            if (change != null) {
                                if (change.pressed) {
                                    if (change.positionChange() != Offset.Zero) {
                                        change.consume()
                                    }
                                    computeMove(change.position)
                                } else {
                                    isDragging = false
                                }
                            } else {
                                isDragging = false
                            }
                        }
                        
                        coroutineScope.launch {
                            val springSpec = androidx.compose.animation.core.spring<Float>(dampingRatio = androidx.compose.animation.core.Spring.DampingRatioMediumBouncy, stiffness = androidx.compose.animation.core.Spring.StiffnessLow)
                            launch { offsetX.animateTo(0f, animationSpec = springSpec) }
                            launch { offsetY.animateTo(0f, animationSpec = springSpec) }
                        }
                    }
                }
            },
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .width(1.dp)
                .fillMaxHeight()
                .background(Color(0x33D0BCFF))
        )
        Box(
            modifier = Modifier
                .height(1.dp)
                .fillMaxWidth()
                .background(Color(0x33D0BCFF))
        )
        Box(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), offsetY.value.roundToInt()) }
                .size(64.dp)
                .clip(CircleShape)
                .background(Color(0xFFD0BCFF))
                .border(2.dp, Color(0xFF1C1B1F), CircleShape)
        )
    }
}"""

# Use regex to replace the old VirtualFlightStick with the new one
pattern = re.compile(r'@Composable\s*fun VirtualFlightStick\(.*?(?=\n@Composable|\Z)', re.DOTALL)
new_content = re.sub(pattern, new_stick, content)

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(new_content)
