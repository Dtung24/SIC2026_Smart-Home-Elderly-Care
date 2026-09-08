### MongoDB Models

# Telemetry

`Telemetry.js` lưu dữ liệu sensor theo thời gian.
    Các field chính:
        room
        sensorType
        deviceId
        value
        unit
        timestamp

# Incident

`Incident.js` lưu sự cố và cảnh báo.
    Các field chính:
        room
        type
        deviceId
        detected
        confidence
        severity
        snapshotPath
        status
        timestamp