package com.example.map

import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class Airport(
    val name: String,
    val iata: String,
    val icao: String,
    val city: String,
    val country: String,
    val latitude: Double,
    val longitude: Double,
    val elevationMeters: Float,
    val runwayHeadingDeg: Float,
    val runwayLengthMeters: Float
) {
    val displayName: String
        get() = "$name (${if (iata.isNotEmpty()) iata else icao}) - $city, $country"
}

fun Airport.toRealWorldLocation(): RealWorldLocation {
    return RealWorldLocation(
        name = name,
        region = "$city, $country",
        latitude = latitude,
        longitude = longitude,
        baseElevationMeters = elevationMeters,
        description = "International airport (${icao} / ${iata}). Runway length: ${runwayLengthMeters.toInt()}m",
        recommendedAltitudeFeet = 4000f,
        terrainMaxHeightMeters = 500f
    )
}

object GlobalAirportDatabase {
    val airports = listOf(
        Airport("Dubai International Airport", "DXB", "OMDB", "Dubai", "United Arab Emirates", 25.2532, 55.3657, 19f, 120f, 4000f),
        Airport("London Heathrow Airport", "LHR", "EGLL", "London", "United Kingdom", 51.4700, -0.4543, 25f, 270f, 3902f),
        Airport("John F. Kennedy International Airport", "JFK", "KJFK", "New York", "United States", 40.6413, -73.7781, 4f, 130f, 4442f),
        Airport("Los Angeles International Airport", "LAX", "KLAX", "Los Angeles", "United States", 33.9416, -118.4085, 38f, 250f, 3685f),
        Airport("Tokyo Haneda Airport", "HND", "RJTT", "Tokyo", "Japan", 35.5494, 139.7798, 6f, 160f, 3360f),
        Airport("Paris Charles de Gaulle Airport", "CDG", "LFPG", "Paris", "France", 49.0097, 2.5479, 119f, 85f, 4215f),
        Airport("Singapore Changi Airport", "SIN", "WSSS", "Singapore", "Singapore", 1.3644, 103.9915, 7f, 20f, 4000f),
        Airport("Sydney Kingsford Smith Airport", "SYD", "YSSY", "Sydney", "Australia", -33.9399, 151.1753, 6f, 160f, 3962f),
        Airport("San Francisco International Airport", "SFO", "KSFO", "San Francisco", "United States", 37.6213, -122.3790, 4f, 280f, 3618f),
        Airport("Frankfurt Airport", "FRA", "EDDF", "Frankfurt", "Germany", 50.0333, 8.5706, 111f, 250f, 4000f),
        Airport("Doha Hamad International Airport", "DOH", "OTHH", "Doha", "Qatar", 25.2731, 51.6081, 13f, 340f, 4850f),
        Airport("Hong Kong International Airport", "HKG", "VHHH", "Hong Kong", "Hong Kong", 22.3080, 113.9185, 9f, 70f, 3800f),
        Airport("Incheon International Airport", "ICN", "RKSI", "Seoul", "South Korea", 37.4692, 126.4505, 7f, 150f, 4000f),
        Airport("Amsterdam Airport Schiphol", "AMS", "EHAM", "Amsterdam", "Netherlands", 52.3105, 4.7683, -3f, 190f, 3800f),
        Airport("Zurich Airport", "ZRH", "LSZH", "Zurich", "Switzerland", 47.4647, 8.5542, 432f, 140f, 3700f)
    )

    fun search(query: String): List<Airport> {
        if (query.isBlank()) return airports
        val q = query.trim().lowercase()
        return airports.filter {
            it.name.lowercase().contains(q) ||
            it.iata.lowercase().contains(q) ||
            it.icao.lowercase().contains(q) ||
            it.city.lowercase().contains(q) ||
            it.country.lowercase().contains(q)
        }
    }

    fun calculateDistanceNm(dep: Airport, arr: Airport): Float {
        val lat1 = Math.toRadians(dep.latitude)
        val lon1 = Math.toRadians(dep.longitude)
        val lat2 = Math.toRadians(arr.latitude)
        val lon2 = Math.toRadians(arr.longitude)

        val dlon = lon2 - lon1
        val dlat = lat2 - lat1
        val a = sin(dlat / 2).let { it * it } + cos(lat1) * cos(lat2) * sin(dlon / 2).let { it * it }
        val c = 2 * asin(sqrt(a))
        val earthRadiusKm = 6371.0
        val distKm = earthRadiusKm * c
        return (distKm * 0.539957f).toFloat()
    }

    fun calculateBearingDeg(dep: Airport, arr: Airport): Float {
        val lat1 = Math.toRadians(dep.latitude)
        val lon1 = Math.toRadians(dep.longitude)
        val lat2 = Math.toRadians(arr.latitude)
        val lon2 = Math.toRadians(arr.longitude)

        val dLon = lon2 - lon1
        val y = sin(dLon) * cos(lat2)
        val x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        var brng = Math.toDegrees(atan2(y, x)).toFloat()
        brng = (brng + 360f) % 360f
        return brng
    }
}
