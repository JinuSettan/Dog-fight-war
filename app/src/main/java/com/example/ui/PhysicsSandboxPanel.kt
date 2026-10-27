package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.physics.AerodynamicsEngine

@Composable
fun PhysicsSandboxPanel(
    physics: AerodynamicsEngine,
    onClose: () -> Unit,
    frameTickState: State<Long> = remember { mutableLongStateOf(0L) },
    modifier: Modifier = Modifier
) {
    // Observe frameTickState so telemetry numbers refresh in real time
    @Suppress("UNUSED_VARIABLE")
    val tick = frameTickState.value
    val st = physics.state

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xEC0F172A)),
        shape = RoundedCornerShape(18.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0x5538BDF8)),
        modifier = modifier
            .width(340.dp)
            .heightIn(max = 520.dp)
            .padding(12.dp)
            .testTag("physics_sandbox_panel")
    ) {
        Column(
            modifier = Modifier
                .padding(14.dp)
                .verticalScroll(rememberScrollState())
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Info, contentDescription = "Debug Info", tint = Color(0xFF38BDF8))
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "PHASE 1 • FLIGHT PHYSICS DEBUG",
                            color = Color(0xFFF8FAFC),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "6-DOF Force & Torque Telemetry",
                            color = Color(0xFF94A3B8),
                            fontSize = 10.sp
                        )
                    }
                }
                IconButton(onClick = onClose, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFFCBD5E1))
                }
            }

            Spacer(Modifier.height(8.dp))

            // INTERACTIVE DEBUG TOGGLES (3D Force Vectors & Wind/Turbulence)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val vectorsOn = physics.showForceVectors
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (vectorsOn) Color(0xFF0284C7) else Color(0xFF1E293B))
                        .border(1.dp, if (vectorsOn) Color(0xFF38BDF8) else Color(0xFF334155), RoundedCornerShape(10.dp))
                        .clickable { physics.showForceVectors = !physics.showForceVectors }
                        .padding(vertical = 8.dp, horizontal = 8.dp)
                        .testTag("toggle_force_vectors_button"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (vectorsOn) "3D VECTORS: ON" else "3D VECTORS: OFF",
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                val windOn = physics.windSystem.isWindEnabled
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (windOn) Color(0xFF0D9488) else Color(0xFF1E293B))
                        .border(1.dp, if (windOn) Color(0xFF2DD4BF) else Color(0xFF334155), RoundedCornerShape(10.dp))
                        .clickable {
                            val next = !physics.windSystem.isWindEnabled
                            physics.windSystem.isWindEnabled = next
                            physics.windSystem.isTurbulenceEnabled = next
                        }
                        .padding(vertical = 8.dp, horizontal = 8.dp)
                        .testTag("toggle_wind_turbulence_button"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (windOn) "WIND/TURB: ON" else "WIND/TURB: OFF",
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // 3D Force Vector Color Legend when active
            if (physics.showForceVectors) {
                Spacer(Modifier.height(6.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF1E293B), RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 5.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    VectorLegendDot("LIFT", Color(0xFF22C55E))
                    VectorLegendDot("DRAG", Color(0xFFEF4444))
                    VectorLegendDot("THRUST", Color(0xFF00E5FF))
                    VectorLegendDot("GRAVITY", Color(0xFFFACC15))
                    VectorLegendDot("VEL/AoA", Color(0xFFE879F9))
                }
            }

            Spacer(Modifier.height(8.dp))

            // QUICK PHASE 1 TEST SCENARIOS (Takeoff, Climb/Turn, Stall)
            Text("PHASE 1 TEST SCENARIOS", color = Color(0xFF38BDF8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                ScenarioButton(
                    label = "1. Takeoff",
                    onClick = { physics.resetToCarrier() },
                    modifier = Modifier.weight(1f).testTag("test_takeoff_button")
                )
                ScenarioButton(
                    label = "2. Climb/Turn",
                    onClick = { physics.reset(startAltitudeMeters = 1000f, startAirspeedKnots = 240f) },
                    modifier = Modifier.weight(1f).testTag("test_climb_turn_button")
                )
                ScenarioButton(
                    label = "3. Stall Test",
                    onClick = { physics.resetToStallTest() },
                    modifier = Modifier.weight(1f).testTag("test_stall_button")
                )
            }

            Spacer(Modifier.height(8.dp))

            // FLIGHT PHASE & STALL STATUS
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1E293B), RoundedCornerShape(8.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "FPS: %.0f".format(st.fps),
                        color = Color(0xFF4ADE80),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = if (st.stallState) "⚠️ STALL ACTIVE" else physics.currentPhase.label.uppercase(),
                        color = if (physics.isCrashed || st.stallState) Color(0xFFEF4444) else Color(0xFF38BDF8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            // 1. KINEMATICS & ORIENTATION (Airspeed, Altitude, VSI, Pitch, Roll, Yaw, AoA)
            Text("FLIGHT STATE & ATTITUDE", color = Color(0xFF38BDF8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))

            TelemetryRow("Airspeed", "%.1f kts (%.1f m/s)".format(st.airspeedKnots, st.airspeedMS))
            TelemetryRow("Altitude", "%.0f ft (%.1f m)".format(st.altitudeFeet, st.altitudeMeters))
            TelemetryRow("Vertical Speed", "%+.0f FPM (%+.1f m/s)".format(st.verticalSpeedFpm, st.verticalSpeedMS))
            TelemetryRow("Pitch", "%+.1f° (q: %+.1f°/s)".format(st.pitchDeg, st.pitchRateDegSec))
            TelemetryRow("Roll", "%+.1f° (p: %+.1f°/s)".format(st.rollDeg, st.rollRateDegSec))
            TelemetryRow("Yaw / Heading", "%05.1f° (r: %+.1f°/s)".format(st.yawDeg, st.yawRateDegSec))
            TelemetryRow(
                label = "Angle of Attack (α)",
                value = "%+.2f° (Stall: %.0f°)".format(st.angleOfAttackDeg, physics.config.stallAngleDeg),
                valueColor = if (st.stallState) Color(0xFFEF4444) else Color(0xFFF8FAFC)
            )
            TelemetryRow("Sideslip (β)", "%+.2f°".format(st.sideslipDeg))

            Spacer(Modifier.height(8.dp))

            // 2. AERODYNAMIC FORCES (Lift, Drag, Thrust, Gravity)
            Text("AERODYNAMIC FORCES (N)", color = Color(0xFF38BDF8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))

            TelemetryRow("Lift Force (L)", "%.0f N (%.1f kN)".format(st.liftForceN, st.liftForceN / 1000f), Color(0xFF22C55E))
            TelemetryRow("Drag Force (D)", "%.0f N (%.1f kN)".format(st.dragForceN, st.dragForceN / 1000f), Color(0xFFF87171))
            TelemetryRow("Thrust (T)", "%.0f N (%.1f kN)".format(st.engineThrustN, st.engineThrustN / 1000f), Color(0xFF00E5FF))
            TelemetryRow("Gravity (W)", "%.0f N (%.1f kN)".format(st.gravityForceN, st.gravityForceN / 1000f), Color(0xFFFACC15))
            TelemetryRow("CL / CD / L:D", "%.2f / %.3f / %.1f".format(st.cL, st.cD, if (st.dragForceN > 1f) st.liftForceN / st.dragForceN else 0f))
            TelemetryRow("Air Density / q", "%.3f kg/m³ | %.0f Pa".format(st.airDensityKgM3, st.dynamicPressurePa))

            Spacer(Modifier.height(8.dp))

            // 3. CONTROLS & SYSTEMS STATE (Throttle, Flap position, Gear state, Fuel)
            Text("SYSTEMS & CONTROL STATE", color = Color(0xFF38BDF8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))

            TelemetryRow(
                label = "Throttle / Spool",
                value = "%.0f%% (Spool %.0f%%) [%s]".format(st.throttle * 100f, physics.actualEngineThrustRatio * 100f, st.engineState.label),
                valueColor = if (physics.isAfterburner) Color(0xFFFBBF24) else Color(0xFFF8FAFC)
            )
            TelemetryRow("Flap Position", "%.0f%% (%s)".format(st.flapsPosition * 100f, if (physics.isFlapsDeployed) "DEPLOYED" else "RETRACTED"))
            TelemetryRow("Airbrake / Spoiler", "%.0f%%".format(st.airbrakePosition * 100f))
            TelemetryRow(
                label = "Gear State",
                value = "${st.gearState.label} (${(physics.gearPosition * 100f).toInt()}%)",
                valueColor = if ( physics.isLandingGearDown ) Color(0xFF4ADE80) else Color(0xFF94A3B8)
            )
            TelemetryRow("Wheel Brakes", if (physics.isParkingBrakeSet) "PARKING BRAKE" else if (physics.isWheelBrakesActive) "ACTIVE" else "RELEASED")
            TelemetryRow("Fuel Remaining", "%.0f / %.0f kg".format(st.fuelKg, st.fuelCapacityKg))
            if (physics.windSystem.isWindEnabled) {
                val w = st.windVelocityMS
                TelemetryRow("Wind Vector (m/s)", "X:%.1f Y:%.1f Z:%.1f".format(w.x, w.y, w.z), Color(0xFF2DD4BF))
            }

            Spacer(Modifier.height(8.dp))

            // 4. AIRCRAFT SPECS SUMMARY
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1E293B), RoundedCornerShape(10.dp))
                    .padding(8.dp)
            ) {
                Text(
                    text = "${physics.config.name} • Mass: ${physics.config.massKg.toInt()} kg • Wing: ${physics.config.wingAreaM2} m² • Vr: ${physics.config.rotationSpeedKnots.toInt()} kts",
                    color = Color(0xFF94A3B8),
                    fontSize = 10.sp,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

@Composable
private fun VectorLegendDot(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .background(color, CircleShape)
        )
        Spacer(Modifier.width(3.dp))
        Text(text = label, color = Color(0xFFE2E8F0), fontSize = 8.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ScenarioButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFF1E293B))
            .border(1.dp, Color(0xFF334155), RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = Color(0xFFE2E8F0),
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun TelemetryRow(
    label: String,
    value: String,
    valueColor: Color = Color(0xFFF8FAFC)
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 1.5.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = Color(0xFF94A3B8), fontSize = 10.sp)
        Text(
            text = value,
            color = valueColor,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = FontFamily.Monospace
        )
    }
}
