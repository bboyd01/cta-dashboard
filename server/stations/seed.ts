/**
 * Fallback station rows, in the same shape as the City of Chicago 'List of L
 * Stops' dataset (8pix-ypme) so they go through the same normalizer as real data.
 *
 * A module rather than a JSON file on purpose: it compiles into the build with
 * everything else, so there is no asset to copy and no file for the container to
 * fail to find at boot.
 *
 * This covers a handful of stations so mock mode and tests work standalone. The
 * server replaces it with the full ~145-station list on first boot with outbound
 * access, or when you run `npm run fetch:stations`.
 */

export const SEED_STATION_ROWS: Record<string, unknown>[] = [
    {
      "map_id": "40380",
      "station_name": "Clark/Lake",
      "stop_id": "30074",
      "direction_id": "W",
      "stop_name": "Clark/Lake (Forest Park-bound)",
      "blue": true
    },
    {
      "map_id": "40380",
      "station_name": "Clark/Lake",
      "stop_id": "30075",
      "direction_id": "E",
      "stop_name": "Clark/Lake (O'Hare-bound)",
      "blue": true
    },
    {
      "map_id": "40380",
      "station_name": "Clark/Lake",
      "stop_id": "30374",
      "direction_id": "N",
      "stop_name": "Clark/Lake (Kimball-bound)",
      "brn": true,
      "p": true
    },
    {
      "map_id": "40380",
      "station_name": "Clark/Lake",
      "stop_id": "30375",
      "direction_id": "S",
      "stop_name": "Clark/Lake (Loop-bound)",
      "brn": true,
      "g": true,
      "org": true,
      "pnk": true
    },
    {
      "map_id": "41320",
      "station_name": "Western",
      "stop_id": "30225",
      "direction_id": "N",
      "stop_name": "Western (Kimball-bound)",
      "brn": true
    },
    {
      "map_id": "41320",
      "station_name": "Western",
      "stop_id": "30226",
      "direction_id": "S",
      "stop_name": "Western (Loop-bound)",
      "brn": true
    },
    {
      "map_id": "40790",
      "station_name": "Belmont",
      "stop_id": "30256",
      "direction_id": "N",
      "stop_name": "Belmont (Kimball-bound)",
      "brn": true,
      "p": true
    },
    {
      "map_id": "40790",
      "station_name": "Belmont",
      "stop_id": "30257",
      "direction_id": "S",
      "stop_name": "Belmont (Loop-bound)",
      "brn": true,
      "p": true
    },
    {
      "map_id": "41660",
      "station_name": "Lake",
      "stop_id": "30050",
      "direction_id": "S",
      "stop_name": "Lake (95th-bound)",
      "red": true
    },
    {
      "map_id": "41660",
      "station_name": "Lake",
      "stop_id": "30051",
      "direction_id": "N",
      "stop_name": "Lake (Howard-bound)",
      "red": true
    },
    {
      "map_id": "40900",
      "station_name": "Howard",
      "stop_id": "30173",
      "direction_id": "S",
      "stop_name": "Howard (95th-bound)",
      "red": true
    },
    {
      "map_id": "40900",
      "station_name": "Howard",
      "stop_id": "30174",
      "direction_id": "N",
      "stop_name": "Howard (Linden/Skokie-bound)",
      "p": true,
      "y": true
    },
    {
      "map_id": "40350",
      "station_name": "UIC-Halsted",
      "stop_id": "30068",
      "direction_id": "W",
      "stop_name": "UIC-Halsted (Forest Park-bound)",
      "blue": true
    },
    {
      "map_id": "40350",
      "station_name": "UIC-Halsted",
      "stop_id": "30069",
      "direction_id": "E",
      "stop_name": "UIC-Halsted (O'Hare-bound)",
      "blue": true
    },
    {
      "map_id": "41400",
      "station_name": "Roosevelt",
      "stop_id": "30265",
      "direction_id": "N",
      "stop_name": "Roosevelt (Howard-bound)",
      "red": true
    },
    {
      "map_id": "41400",
      "station_name": "Roosevelt",
      "stop_id": "30266",
      "direction_id": "S",
      "stop_name": "Roosevelt (95th-bound)",
      "red": true
    },
    {
      "map_id": "41400",
      "station_name": "Roosevelt",
      "stop_id": "30268",
      "direction_id": "N",
      "stop_name": "Roosevelt (Loop-bound)",
      "org": true,
      "g": true
    },
    {
      "map_id": "41400",
      "station_name": "Roosevelt",
      "stop_id": "30269",
      "direction_id": "S",
      "stop_name": "Roosevelt (Midway-bound)",
      "org": true,
      "g": true
    }
  ]
