(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-VIN u101)
(define-constant ERR-INVALID-SERVICE-TYPE u102)
(define-constant ERR-INVALID-PARTS u103)
(define-constant ERR-INVALID-DETAILS u104)
(define-constant ERR-INVALID-TIMESTAMP u105)
(define-constant ERR-RECORD-NOT-FOUND u106)
(define-constant ERR-MECHANIC-NOT-CERTIFIED u107)
(define-constant ERR-VEHICLE-NOT-REGISTERED u108)
(define-constant ERR-INVALID-RECORD-ID u109)
(define-constant ERR-MAX-RECORDS-EXCEEDED u110)

(define-data-var next-record-id uint u0)
(define-data-var max-records uint u10000)
(define-data-var authority-contract (optional principal) none)

(define-map maintenance-records
  uint
  {
    vin: (string-ascii 17),
    service-type: (string-ascii 50),
    mechanic: principal,
    parts: (list 10 (string-ascii 50)),
    details: (string-ascii 200),
    timestamp: uint,
    recorded-by: principal
  }
)

(define-map records-by-vin
  (string-ascii 17)
  (list 100 uint)
)

(define-read-only (get-record (record-id uint))
  (map-get? maintenance-records record-id)
)

(define-read-only (get-records-by-vin (vin (string-ascii 17)))
  (map-get? records-by-vin vin)
)

(define-read-only (get-record-count)
  (ok (var-get next-record-id))
)

(define-private (validate-vin (vin (string-ascii 17)))
  (if (and (> (len vin) u0) (<= (len vin) u17))
      (ok true)
      (err ERR-INVALID-VIN))
)

(define-private (validate-service-type (service-type (string-ascii 50)))
  (if (and (> (len service-type) u0) (<= (len service-type) u50))
      (ok true)
      (err ERR-INVALID-SERVICE-TYPE))
)

(define-private (validate-parts (parts (list 10 (string-ascii 50))))
  (if (<= (len parts) u10)
      (ok true)
      (err ERR-INVALID-PARTS))
)

(define-private (validate-details (details (string-ascii 200)))
  (if (<= (len details) u200)
      (ok true)
      (err ERR-INVALID-DETAILS))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (log-maintenance
  (vin (string-ascii 17))
  (service-type (string-ascii 50))
  (parts (list 10 (string-ascii 50)))
  (details (string-ascii 200))
)
  (let (
        (record-id (var-get next-record-id))
        (authority (var-get authority-contract))
      )
    (asserts! (< record-id (var-get max-records)) (err ERR-MAX-RECORDS-EXCEEDED))
    (try! (validate-vin vin))
    (try! (validate-service-type service-type))
    (try! (validate-parts parts))
    (try! (validate-details details))
    (try! (validate-timestamp block-height))
    (asserts! (is-some authority) (err ERR-NOT-AUTHORIZED))
    (map-set maintenance-records record-id
      {
        vin: vin,
        service-type: service-type,
        mechanic: tx-sender,
        parts: parts,
        details: details,
        timestamp: block-height,
        recorded-by: tx-sender
      }
    )
    (map-set records-by-vin vin
      (unwrap! (as-max-len? (cons record-id (default-to (list) (map-get? records-by-vin vin))) u100) (err ERR-INVALID-RECORD-ID))
    )
    (var-set next-record-id (+ record-id u1))
    (print { event: "maintenance-logged", id: record-id, vin: vin })
    (ok record-id)
  )
)

(define-public (update-maintenance
  (record-id uint)
  (service-type (string-ascii 50))
  (parts (list 10 (string-ascii 50)))
  (details (string-ascii 200))
)
  (let ((record (map-get? maintenance-records record-id)))
    (match record
      r
        (begin
          (asserts! (is-eq (get recorded-by r) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-service-type service-type))
          (try! (validate-parts parts))
          (try! (validate-details details))
          (map-set maintenance-records record-id
            {
              vin: (get vin r),
              service-type: service-type,
              mechanic: (get mechanic r),
              parts: parts,
              details: details,
              timestamp: block-height,
              recorded-by: (get recorded-by r)
            }
          )
          (print { event: "maintenance-updated", id: record-id })
          (ok true)
        )
      (err ERR-RECORD-NOT-FOUND)
    )
  )
)