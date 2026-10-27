package com.example.physics

import kotlin.math.sqrt

data class Vector3D(
    var x: Float = 0f,
    var y: Float = 0f,
    var z: Float = 0f
) {
    operator fun plus(other: Vector3D) = Vector3D(x + other.x, y + other.y, z + other.z)
    operator fun minus(other: Vector3D) = Vector3D(x - other.x, y - other.y, z - other.z)
    operator fun times(scalar: Float) = Vector3D(x * scalar, y * scalar, z * scalar)
    operator fun div(scalar: Float) = if (scalar != 0f) Vector3D(x / scalar, y / scalar, z / scalar) else Vector3D()

    fun length(): Float = sqrt(x * x + y * y + z * z)
    fun lengthSquared(): Float = x * x + y * y + z * z

    fun normalized(): Vector3D {
        val len = length()
        return if (len > 0.00001f) this / len else Vector3D(0f, 0f, 0f)
    }

    fun dot(other: Vector3D): Float = x * other.x + y * other.y + z * other.z

    fun cross(other: Vector3D): Vector3D = Vector3D(
        y * other.z - z * other.y,
        z * other.x - x * other.z,
        x * other.y - y * other.x
    )

    fun lerp(other: Vector3D, t: Float): Vector3D {
        val ct = t.coerceIn(0f, 1f)
        return Vector3D(
            x + (other.x - x) * ct,
            y + (other.y - y) * ct,
            z + (other.z - z) * ct
        )
    }

    fun set(nx: Float, ny: Float, nz: Float) {
        x = nx
        y = ny
        z = nz
    }

    companion object {
        val ZERO = Vector3D(0f, 0f, 0f)
        val UNIT_X = Vector3D(1f, 0f, 0f)
        val UNIT_Y = Vector3D(0f, 1f, 0f)
        val UNIT_Z = Vector3D(0f, 0f, 1f)
    }
}
