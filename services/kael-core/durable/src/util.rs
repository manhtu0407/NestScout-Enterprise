use std::fs::File;
use std::io::Read;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use sha2::{Digest, Sha256};

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_millis() as u64)
}

pub fn valid_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => *byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        })
}

pub fn random_uuid() -> String {
    let mut bytes = [0u8; 16];
    File::open("/dev/urandom")
        .and_then(|mut source| source.read_exact(&mut bytes))
        .expect("operating system randomness is available");
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!("{}-{}-{}-{}-{}", &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..32])
}

pub fn sha256_hex(input: &str) -> String {
    Sha256::digest(input.as_bytes()).iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn canonical_json(value: &Value) -> String {
    match value {
        Value::Array(items) => format!("[{}]", items.iter().map(canonical_json).collect::<Vec<_>>().join(",")),
        Value::Object(fields) => {
            let mut keys: Vec<&String> = fields.keys().collect();
            keys.sort();
            let body: Vec<String> = keys
                .into_iter()
                .map(|key| format!("{}:{}", Value::String(key.clone()), canonical_json(&fields[key])))
                .collect();
            format!("{{{}}}", body.join(","))
        }
        other => other.to_string(),
    }
}

pub fn fingerprint(value: &Value) -> String {
    sha256_hex(&canonical_json(value))
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let yoe = year.rem_euclid(400);
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

pub fn vietnam_date(now: u64) -> String {
    let (year, month, day) = civil_from_days(((now / 1000) as i64 + 7 * 3600).div_euclid(86_400));
    format!("{year:04}-{month:02}-{day:02}")
}

pub fn vietnam_time(iso: &str) -> String {
    match parse_iso_ms(iso) {
        Some(ms) => {
            let local = ms / 1000 + 7 * 3600;
            let (year, month, day) = civil_from_days(local.div_euclid(86_400));
            let seconds = local.rem_euclid(86_400);
            format!("{:02}:{:02} {day:02}/{month:02}/{year:04}", seconds / 3600, seconds % 3600 / 60)
        }
        None => "Không rõ".to_owned(),
    }
}

pub fn parse_iso_ms(raw: &str) -> Option<i64> {
    let (date, rest) = raw.split_once(['T', ' '])?;
    let mut date_parts = date.split('-');
    let year: i64 = date_parts.next()?.parse().ok()?;
    let month: i64 = date_parts.next()?.parse().ok()?;
    let day: i64 = date_parts.next()?.parse().ok()?;
    let split = rest.find(['Z', '+', '-']).unwrap_or(rest.len());
    let (clock, zone) = rest.split_at(split);
    let mut clock_parts = clock.split(':');
    let hour: i64 = clock_parts.next()?.parse().ok()?;
    let minute: i64 = clock_parts.next()?.parse().ok()?;
    let seconds_raw = clock_parts.next().unwrap_or("0");
    let (whole, fraction) = seconds_raw.split_once('.').unwrap_or((seconds_raw, ""));
    let second: i64 = whole.parse().ok()?;
    let millis: i64 = format!("{:0<3}", fraction).get(0..3)?.parse().ok()?;
    let offset = match zone {
        "" | "Z" => 0,
        zone => {
            let sign = if zone.starts_with('-') { -1 } else { 1 };
            let digits = zone[1..].replace(':', "");
            let hours: i64 = digits.get(0..2)?.parse().ok()?;
            let minutes: i64 = digits.get(2..4).unwrap_or("00").parse().ok()?;
            sign * (hours * 3600 + minutes * 60)
        }
    };
    let days = days_from_civil(year, month, day);
    Some(((days * 86_400 + hour * 3600 + minute * 60 + second - offset) * 1000) + millis)
}

pub fn money(minor: &Value) -> String {
    let amount = minor.as_i64().unwrap_or(0);
    let digits = amount.abs().to_string();
    let mut grouped = String::new();
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(digit);
    }
    format!("{}{grouped} ₫", if amount < 0 { "-" } else { "" })
}

pub fn clip(value: &Value, limit: usize) -> String {
    value.as_str().map(|text| text.chars().take(limit).collect()).unwrap_or_default()
}
