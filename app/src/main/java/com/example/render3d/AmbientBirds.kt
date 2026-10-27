package com.example.render3d

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import com.example.physics.Matrix4
import com.example.physics.Vector3D
import kotlin.math.sin
import kotlin.math.cos

data class Bird(
    var x: Float,
    var y: Float,
    var z: Float,
    var headingRad: Float,
    var speed: Float,
    var flapPhase: Float
)

class AmbientBirdSystem {
    private val birds = mutableListOf<Bird>()
    private val maxBirds = 35

    init {
        val random = kotlin.random.Random(42)
        for (i in 0 until maxBirds) {
            birds.add(
                Bird(
                    x = (random.nextFloat() - 0.5f) * 6000f,
                    y = random.nextFloat() * 400f + 150f,
                    z = (random.nextFloat() - 0.5f) * 6000f,
                    headingRad = random.nextFloat() * 2f * Math.PI.toFloat(),
                    speed = random.nextFloat() * 30f + 40f, // 40-70 m/s flight speed
                    flapPhase = random.nextFloat() * 6.28f
                )
            )
        }
    }

    fun update(dtSec: Float, planePos: Vector3D) {
        val worldRadius = 8000f
        birds.forEach { bird ->
            // Update position along heading
            bird.x += sin(bird.headingRad) * bird.speed * dtSec
            bird.z += cos(bird.headingRad) * bird.speed * dtSec
            bird.flapPhase += dtSec * 12f

            // Gentle heading wandering
            bird.headingRad += (sin(bird.flapPhase * 0.2f) * 0.1f) * dtSec

            // Keep birds tethered near the plane / airport area
            val dx = bird.x - planePos.x
            val dz = bird.z - planePos.z
            if (dx > worldRadius) bird.x = planePos.x - worldRadius
            if (dx < -worldRadius) bird.x = planePos.x + worldRadius
            if (dz > worldRadius) bird.z = planePos.z - worldRadius
            if (dz < -worldRadius) bird.z = planePos.z + worldRadius
        }
    }

    fun draw(drawScope: DrawScope, viewProj: Matrix4, width: Float, height: Float, planePos: Vector3D) {
        val birdColor = Color(0xCC333333)
        val birdHighlight = Color(0xAAE2E8F0)

        birds.forEach { bird ->
            // Distance culling: only render birds within 4000 meters of the aircraft
            val dist = kotlin.math.sqrt(
                (bird.x - planePos.x) * (bird.x - planePos.x) +
                (bird.y - planePos.y) * (bird.y - planePos.y) +
                (bird.z - planePos.z) * (bird.z - planePos.z)
            )
            if (dist < 4000f) {
                val worldPos = Vector3D(bird.x, bird.y, bird.z)
                val clip = viewProj.transformVector(worldPos)
                if (clip.z in -1.0f..1.0f) {
                    val sx = (clip.x + 1.0f) * 0.5f * width
                    val sy = (1.0f - clip.y) * 0.5f * height
                    val size = (15f / (clip.z + 1.0f)).coerceIn(3f, 25f)

                    val wingSpanOffset = sin(bird.flapPhase) * size * 0.8f

                    // Draw simple low-poly V-wing bird silhouette
                    drawScope.drawLine(
                        color = birdHighlight,
                        start = Offset(sx - size, sy + wingSpanOffset * 0.5f),
                        end = Offset(sx, sy - wingSpanOffset * 0.3f),
                        strokeWidth = 1.5f
                    )
                    drawScope.drawLine(
                        color = birdHighlight,
                        start = Offset(sx, sy - wingSpanOffset * 0.3f),
                        end = Offset(sx + size, sy + wingSpanOffset * 0.5f),
                        strokeWidth = 1.5f
                    )
                }
            }
        }
    }
}
