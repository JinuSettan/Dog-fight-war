package com.example.render3d

import com.example.physics.Matrix4
import com.example.physics.Vector3D
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

data class RingWaypoint(
    val id: Int,
    val position: Vector3D,
    val radius: Float = 40f,
    var isPassed: Boolean = false,
    var isActive: Boolean = false
)

object JetMesh {
    // 3D local coordinate vertices for Fighter Jet (Scale ~ 16m long, 11m wingspan)
    val vertices = listOf(
        // 0: Nose tip
        Vector3D(0f, 0f, 8.5f),

        // 1: Nose bridge / cockpit front
        Vector3D(0f, 0.7f, 3.5f),

        // 2: Cockpit canopy top peak
        Vector3D(0f, 1.3f, 1.2f),

        // 3: Cockpit canopy rear base
        Vector3D(0f, 0.8f, -0.8f),

        // 4: Canopy glass left edge
        Vector3D(-0.6f, 0.75f, 1.2f),

        // 5: Canopy glass right edge
        Vector3D(0.6f, 0.75f, 1.2f),

        // 6: Fuselage belly front
        Vector3D(0f, -0.5f, 3.5f),

        // 7: Fuselage belly mid
        Vector3D(0f, -0.7f, -1.0f),

        // 8: Fuselage tail top
        Vector3D(0f, 0.5f, -6.0f),

        // 9: Fuselage tail bottom
        Vector3D(0f, -0.5f, -6.0f),

        // 10: Left Wing Root Front
        Vector3D(-1.2f, 0f, 2.0f),

        // 11: Left Wing Tip Front (Swept-back)
        Vector3D(-6.2f, -0.1f, -2.5f),

        // 12: Left Wing Tip Rear
        Vector3D(-5.5f, -0.1f, -3.5f),

        // 13: Left Wing Root Rear
        Vector3D(-1.2f, 0f, -4.5f),

        // 14: Right Wing Root Front
        Vector3D(1.2f, 0f, 2.0f),

        // 15: Right Wing Tip Front
        Vector3D(6.2f, -0.1f, -2.5f),

        // 16: Right Wing Tip Rear
        Vector3D(5.5f, -0.1f, -3.5f),

        // 17: Right Wing Root Rear
        Vector3D(1.2f, 0f, -4.5f),

        // 18: Left Fin Root Front
        Vector3D(-0.8f, 0.3f, -3.5f),

        // 19: Left Fin Tip
        Vector3D(-1.8f, 2.8f, -5.5f),

        // 20: Left Fin Root Rear
        Vector3D(-0.8f, 0.2f, -6.0f),

        // 21: Right Fin Root Front
        Vector3D(0.8f, 0.3f, -3.5f),

        // 22: Right Fin Tip
        Vector3D(1.8f, 2.8f, -5.5f),

        // 23: Right Fin Root Rear
        Vector3D(0.8f, 0.2f, -6.0f),

        // 24: Left Engine Nozzle Center
        Vector3D(-0.6f, -0.1f, -6.5f),

        // 25: Right Engine Nozzle Center
        Vector3D(0.6f, -0.1f, -6.5f)
    )

    enum class MeshMaterial {
        FUSELAGE_DARK,
        FUSELAGE_LIGHT,
        CANOPY_GLASS,
        WING_SURFACE,
        TAIL_FIN
    }

    data class Face(
        val v1: Int,
        val v2: Int,
        val v3: Int,
        val material: MeshMaterial
    )

    val faces = listOf(
        // Fuselage Nose Upper Left & Right
        Face(0, 1, 4, MeshMaterial.FUSELAGE_LIGHT),
        Face(0, 4, 10, MeshMaterial.FUSELAGE_DARK),
        Face(0, 5, 1, MeshMaterial.FUSELAGE_LIGHT),
        Face(0, 14, 5, MeshMaterial.FUSELAGE_DARK),

        // Fuselage Nose Belly
        Face(0, 6, 10, MeshMaterial.FUSELAGE_DARK),
        Face(0, 14, 6, MeshMaterial.FUSELAGE_DARK),

        // Cockpit Canopy Glass (Glossy Blue/Cyan Window)
        Face(1, 2, 4, MeshMaterial.CANOPY_GLASS),
        Face(1, 5, 2, MeshMaterial.CANOPY_GLASS),
        Face(2, 3, 4, MeshMaterial.CANOPY_GLASS),
        Face(2, 5, 3, MeshMaterial.CANOPY_GLASS),

        // Fuselage Mid/Spine & Tail
        Face(3, 8, 4, MeshMaterial.FUSELAGE_LIGHT),
        Face(3, 5, 8, MeshMaterial.FUSELAGE_LIGHT),
        Face(6, 7, 10, MeshMaterial.FUSELAGE_DARK),
        Face(6, 14, 7, MeshMaterial.FUSELAGE_DARK),
        Face(7, 9, 13, MeshMaterial.FUSELAGE_DARK),
        Face(7, 17, 9, MeshMaterial.FUSELAGE_DARK),
        Face(8, 9, 13, MeshMaterial.FUSELAGE_DARK),
        Face(8, 17, 9, MeshMaterial.FUSELAGE_DARK),

        // Swept-back Fighter Left Wing
        Face(10, 11, 12, MeshMaterial.WING_SURFACE),
        Face(10, 12, 13, MeshMaterial.WING_SURFACE),

        // Swept-back Fighter Right Wing
        Face(14, 16, 15, MeshMaterial.WING_SURFACE),
        Face(14, 17, 16, MeshMaterial.WING_SURFACE),

        // Left Vertical Stabilizer (Tail Fin)
        Face(18, 19, 20, MeshMaterial.TAIL_FIN),

        // Right Vertical Stabilizer (Tail Fin)
        Face(21, 22, 23, MeshMaterial.TAIL_FIN)
    )

    val edges = listOf(
        0 to 1, 1 to 2, 2 to 3, 3 to 8, 0 to 6, 6 to 7, 7 to 9, 8 to 9,
        1 to 4, 1 to 5, 3 to 4, 3 to 5, // Canopy outline
        10 to 11, 11 to 12, 12 to 13, 10 to 13, // Left wing
        14 to 15, 15 to 16, 16 to 17, 14 to 17, // Right wing
        18 to 19, 19 to 20, 18 to 20, // Left fin
        21 to 22, 22 to 23, 21 to 23  // Right fin
    )
}

class World3D {
    // Waypoint Ring Course
    val ringWaypoints = mutableListOf<RingWaypoint>()
    var currentRingIndex = 0
    var score = 0

    init {
        generateRingCourse()
    }

    fun generateRingCourse() {
        ringWaypoints.clear()
        currentRingIndex = 0
        score = 0

        // Create a fun aerial slalom circuit starting past runway
        val basePoints = listOf(
            Vector3D(0f, 200f, 800f),
            Vector3D(300f, 350f, 1600f),
            Vector3D(600f, 500f, 2600f),
            Vector3D(200f, 600f, 3800f),
            Vector3D(-400f, 550f, 4800f),
            Vector3D(-800f, 400f, 3800f),
            Vector3D(-600f, 300f, 2400f),
            Vector3D(-200f, 150f, 1200f)
        )

        basePoints.forEachIndexed { idx, pos ->
            ringWaypoints.add(
                RingWaypoint(
                    id = idx + 1,
                    position = pos,
                    radius = 45f,
                    isPassed = false,
                    isActive = (idx == 0)
                )
            )
        }
    }

    fun updateRingProgress(planePos: Vector3D): Boolean {
        if (currentRingIndex >= ringWaypoints.size) return false

        val ring = ringWaypoints[currentRingIndex]
        val distToRing = (planePos - ring.position).length()

        if (distToRing <= ring.radius + 15f) {
            ring.isPassed = true
            ring.isActive = false
            score += 100
            currentRingIndex++

            if (currentRingIndex < ringWaypoints.size) {
                ringWaypoints[currentRingIndex].isActive = true
            }
            return true
        }
        return false
    }

    companion object {
        // Aircraft Carrier parameters at World Origin (0, 0, 0)
        val CARRIER_LENGTH = 332f
        val CARRIER_WIDTH = 76f
        val CARRIER_START_Z = -166f
        val CARRIER_END_Z = 166f
        val CARRIER_ALTITUDE = 20f

        // Mountain Peaks wireframe landmarks
        val MOUNTAINS = listOf(
            Vector3D(-2500f, 1200f, 4000f),
            Vector3D(-1500f, 950f, 5200f),
            Vector3D(2000f, 1400f, 4500f),
            Vector3D(3200f, 1800f, 3000f),
            Vector3D(-3500f, 1600f, -2000f)
        )
    }
}
