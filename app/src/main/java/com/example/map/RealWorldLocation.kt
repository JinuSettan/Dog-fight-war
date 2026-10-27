package com.example.map

data class RealWorldLocation(
    val name: String,
    val region: String,
    val latitude: Double,
    val longitude: Double,
    val baseElevationMeters: Float,
    val description: String,
    val recommendedAltitudeFeet: Float = 5000f,
    val terrainMaxHeightMeters: Float = 1000f
) {
    companion object {
        val GRAND_CANYON = RealWorldLocation(
            name = "Grand Canyon",
            region = "Arizona, USA",
            latitude = 36.0544,
            longitude = -112.1401,
            baseElevationMeters = 2100f,
            description = "Deep river canyon terrain with dramatic rock cliffs and plateaus",
            recommendedAltitudeFeet = 6500f,
            terrainMaxHeightMeters = 2200f
        )

        val SWISS_ALPS = RealWorldLocation(
            name = "Swiss Alps (Matterhorn)",
            region = "Zermatt, Switzerland",
            latitude = 45.9765,
            longitude = 7.6585,
            baseElevationMeters = 2500f,
            description = "High alpine mountain peaks, sharp ridges, and deep glacial valleys",
            recommendedAltitudeFeet = 12000f,
            terrainMaxHeightMeters = 4478f
        )

        val SAN_FRANCISCO = RealWorldLocation(
            name = "San Francisco Bay",
            region = "California, USA",
            latitude = 37.8199,
            longitude = -122.4783,
            baseElevationMeters = 10f,
            description = "Golden Gate Strait, urban skyline, ocean coastline, and bay hills",
            recommendedAltitudeFeet = 3500f,
            terrainMaxHeightMeters = 300f
        )

        val SAN_FRANCISCO_COAST = RealWorldLocation(
            name = "San Francisco Coast",
            region = "California, USA",
            latitude = 37.7800,
            longitude = -122.5250,
            baseElevationMeters = 0f,
            description = "Pacific Ocean coastline with views of the Golden Gate and urban skyline",
            recommendedAltitudeFeet = 3500f,
            terrainMaxHeightMeters = 300f
        )

        val MOUNT_EVEREST = RealWorldLocation(
            name = "Mount Everest",
            region = "Himalayas, Nepal",
            latitude = 27.9881,
            longitude = 86.9250,
            baseElevationMeters = 5000f,
            description = "The roof of the world with extreme mountain terrain and high wind conditions",
            recommendedAltitudeFeet = 28000f,
            terrainMaxHeightMeters = 8848f
        )

        val OAHU_HAWAII = RealWorldLocation(
            name = "Oahu / Honolulu",
            region = "Hawaii, USA",
            latitude = 21.3069,
            longitude = -157.8583,
            baseElevationMeters = 0f,
            description = "Pacific island reefs, volcanic craters (Diamond Head), and lush coastal valleys",
            recommendedAltitudeFeet = 4000f,
            terrainMaxHeightMeters = 1200f
        )

        val TOKYO_METROPOLIS = RealWorldLocation(
            name = "Tokyo & Mount Fuji",
            region = "Kanto, Japan",
            latitude = 35.6762,
            longitude = 139.6503,
            baseElevationMeters = 20f,
            description = "Vast urban 3D metropolis with Mount Fuji visible on the western horizon",
            recommendedAltitudeFeet = 5000f,
            terrainMaxHeightMeters = 3776f
        )

        val KERALA_INDIA = RealWorldLocation(
            name = "Kerala (Cochin & Ghats)",
            region = "Kerala, India",
            latitude = 9.9312,
            longitude = 76.2673,
            baseElevationMeters = 5f,
            description = "Tropical Arabian Sea coast, backwater lagoons, coconut palm groves & lush Western Ghats peaks",
            recommendedAltitudeFeet = 4500f,
            terrainMaxHeightMeters = 2695f
        )

        val DUBAI_PALM = RealWorldLocation(
            name = "Dubai & Palm Jumeirah",
            region = "Dubai, UAE",
            latitude = 25.1124,
            longitude = 55.1390,
            baseElevationMeters = 5f,
            description = "Iconic Palm Islands, Burj Khalifa skyline, and Persian Gulf deep blue coastlines",
            recommendedAltitudeFeet = 3500f,
            terrainMaxHeightMeters = 830f
        )

        val RIO_DE_JANEIRO = RealWorldLocation(
            name = "Rio de Janeiro",
            region = "Rio, Brazil",
            latitude = -22.9068,
            longitude = -43.1729,
            baseElevationMeters = 5f,
            description = "Guanabara Bay, Sugarloaf mountain, Copacabana beaches and granite coastal peaks",
            recommendedAltitudeFeet = 4000f,
            terrainMaxHeightMeters = 1021f
        )

        val LONDON_THAMES = RealWorldLocation(
            name = "London & Heathrow",
            region = "England, UK",
            latitude = 51.4700,
            longitude = -0.4543,
            baseElevationMeters = 25f,
            description = "Historic River Thames corridor, London Eye, Tower Bridge, and busy international airspace",
            recommendedAltitudeFeet = 3500f,
            terrainMaxHeightMeters = 245f
        )

        val PACIFIC_OCEAN_CARRIER = RealWorldLocation(
            name = "Aircraft Carrier Strike Group",
            region = "Pacific Ocean",
            latitude = 23.5,
            longitude = -160.0,
            baseElevationMeters = 0f,
            description = "Open ocean operations near the Hawaiian islands. Clear skies, deep blue water.",
            recommendedAltitudeFeet = 5000f,
            terrainMaxHeightMeters = 0f
        )

        val ALL_LOCATIONS = listOf(
            PACIFIC_OCEAN_CARRIER,
            SAN_FRANCISCO,
            SAN_FRANCISCO_COAST,
            GRAND_CANYON,
            SWISS_ALPS,
            KERALA_INDIA,
            MOUNT_EVEREST,
            OAHU_HAWAII,
            TOKYO_METROPOLIS,
            DUBAI_PALM,
            RIO_DE_JANEIRO,
            LONDON_THAMES
        )
    }
}
