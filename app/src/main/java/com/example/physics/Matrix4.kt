package com.example.physics

import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tan

class Matrix4 {
    val m = FloatArray(16)

    init {
        identity()
    }

    fun identity(): Matrix4 {
        for (i in 0..15) m[i] = 0f
        m[0] = 1f
        m[5] = 1f
        m[10] = 1f
        m[15] = 1f
        return this
    }

    fun multiply(other: Matrix4): Matrix4 {
        val result = Matrix4()
        for (row in 0..3) {
            for (col in 0..3) {
                var sum = 0f
                for (i in 0..3) {
                    sum += this.m[row * 4 + i] * other.m[i * 4 + col]
                }
                result.m[row * 4 + col] = sum
            }
        }
        return result
    }

    fun transformVector(v: Vector3D): Vector3D {
        val x = v.x * m[0] + v.y * m[1] + v.z * m[2] + m[3]
        val y = v.x * m[4] + v.y * m[5] + v.z * m[6] + m[7]
        val z = v.x * m[8] + v.y * m[9] + v.z * m[10] + m[11]
        val w = v.x * m[12] + v.y * m[13] + v.z * m[14] + m[15]

        return if (w != 0f && w != 1f) {
            Vector3D(x / w, y / w, z / w)
        } else {
            Vector3D(x, y, z)
        }
    }

    companion object {
        fun identity(): Matrix4 = Matrix4()

        fun translation(tx: Float, ty: Float, tz: Float): Matrix4 {
            val mat = Matrix4()
            mat.m[3] = tx
            mat.m[7] = ty
            mat.m[11] = tz
            return mat
        }

        fun rotationX(angleRad: Float): Matrix4 {
            val mat = Matrix4()
            val c = cos(angleRad)
            val s = sin(angleRad)
            mat.m[5] = c
            mat.m[6] = s
            mat.m[9] = -s
            mat.m[10] = c
            return mat
        }

        fun rotationY(angleRad: Float): Matrix4 {
            val mat = Matrix4()
            val c = cos(angleRad)
            val s = sin(angleRad)
            mat.m[0] = c
            mat.m[2] = s
            mat.m[8] = -s
            mat.m[10] = c
            return mat
        }

        fun rotationZ(angleRad: Float): Matrix4 {
            val mat = Matrix4()
            val c = cos(angleRad)
            val s = sin(angleRad)
            mat.m[0] = c
            mat.m[1] = s
            mat.m[4] = -s
            mat.m[5] = c
            return mat
        }

        /**
         * Create aircraft body rotation matrix from Yaw (Y), Pitch (X), and Roll (Z) angles.
         */
        fun rotationYawPitchRoll(yawRad: Float, pitchRad: Float, rollRad: Float): Matrix4 {
            val rY = rotationY(yawRad)
            val rP = rotationX(pitchRad)
            val rR = rotationZ(rollRad)
            // Combined rotation: Y * P * R
            return rY.multiply(rP).multiply(rR)
        }

        fun perspective(fovYDeg: Float, aspect: Float, near: Float, far: Float): Matrix4 {
            val mat = Matrix4()
            val f = 1.0f / tan(Math.toRadians(fovYDeg.toDouble() / 2.0)).toFloat()
            val rangeInv = 1.0f / (near - far)

            mat.m[0] = f / aspect
            mat.m[5] = f
            mat.m[10] = (far + near) * rangeInv
            mat.m[11] = 2.0f * far * near * rangeInv
            mat.m[14] = -1.0f
            mat.m[15] = 0.0f
            return mat
        }

        fun lookAt(eye: Vector3D, target: Vector3D, up: Vector3D): Matrix4 {
            val forward = (target - eye).normalized()
            val side = forward.cross(up).normalized()
            val newUp = side.cross(forward).normalized()

            val mat = Matrix4()
            mat.m[0] = side.x
            mat.m[1] = side.y
            mat.m[2] = side.z
            mat.m[3] = -side.dot(eye)

            mat.m[4] = newUp.x
            mat.m[5] = newUp.y
            mat.m[6] = newUp.z
            mat.m[7] = -newUp.dot(eye)

            mat.m[8] = -forward.x
            mat.m[9] = -forward.y
            mat.m[10] = -forward.z
            mat.m[11] = forward.dot(eye)

            mat.m[12] = 0f
            mat.m[13] = 0f
            mat.m[14] = 0f
            mat.m[15] = 1f
            return mat
        }
    }
}
