import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, listCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_VIN = 101;
const ERR_INVALID_SERVICE_TYPE = 102;
const ERR_INVALID_PARTS = 103;
const ERR_INVALID_DETAILS = 104;
const ERR_INVALID_TIMESTAMP = 105;
const ERR_RECORD_NOT_FOUND = 106;
const ERR_MAX_RECORDS_EXCEEDED = 110;

interface MaintenanceRecord {
  vin: string;
  serviceType: string;
  mechanic: string;
  parts: string[];
  details: string;
  timestamp: number;
  recordedBy: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class MaintenanceLogMock {
  state: {
    nextRecordId: number;
    maxRecords: number;
    authorityContract: string | null;
    records: Map<number, MaintenanceRecord>;
    recordsByVin: Map<string, number[]>;
  } = {
    nextRecordId: 0,
    maxRecords: 10000,
    authorityContract: null,
    records: new Map(),
    recordsByVin: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);

  reset() {
    this.state = {
      nextRecordId: 0,
      maxRecords: 10000,
      authorityContract: null,
      records: new Map(),
      recordsByVin: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    if (this.state.authorityContract !== null) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  logMaintenance(vin: string, serviceType: string, parts: string[], details: string): Result<number> {
    if (this.state.nextRecordId >= this.state.maxRecords) return { ok: false, value: ERR_MAX_RECORDS_EXCEEDED };
    if (!vin || vin.length > 17) return { ok: false, value: ERR_INVALID_VIN };
    if (!serviceType || serviceType.length > 50) return { ok: false, value: ERR_INVALID_SERVICE_TYPE };
    if (parts.length > 10) return { ok: false, value: ERR_INVALID_PARTS };
    if (details.length > 200) return { ok: false, value: ERR_INVALID_DETAILS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };

    const id = this.state.nextRecordId;
    const record: MaintenanceRecord = { vin, serviceType, mechanic: this.caller, parts, details, timestamp: this.blockHeight, recordedBy: this.caller };
    this.state.records.set(id, record);
    const currentRecords = this.state.recordsByVin.get(vin) || [];
    this.state.recordsByVin.set(vin, [id, ...currentRecords].slice(0, 100));
    this.state.nextRecordId++;
    return { ok: true, value: id };
  }

  updateMaintenance(recordId: number, serviceType: string, parts: string[], details: string): Result<boolean> {
    const record = this.state.records.get(recordId);
    if (!record) return { ok: false, value: ERR_RECORD_NOT_FOUND };
    if (record.recordedBy !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!serviceType || serviceType.length > 50) return { ok: false, value: ERR_INVALID_SERVICE_TYPE };
    if (parts.length > 10) return { ok: false, value: ERR_INVALID_PARTS };
    if (details.length > 200) return { ok: false, value: ERR_INVALID_DETAILS };

    const updated: MaintenanceRecord = { ...record, serviceType, parts, details, timestamp: this.blockHeight };
    this.state.records.set(recordId, updated);
    return { ok: true, value: true };
  }

  getRecord(recordId: number): MaintenanceRecord | null {
    return this.state.records.get(recordId) || null;
  }

  getRecordsByVin(vin: string): number[] | null {
    return this.state.recordsByVin.get(vin) || null;
  }

  getRecordCount(): Result<number> {
    return { ok: true, value: this.state.nextRecordId };
  }
}

describe("MaintenanceLog", () => {
  let contract: MaintenanceLogMock;

  beforeEach(() => {
    contract = new MaintenanceLogMock();
    contract.reset();
  });

  it("logs maintenance successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.logMaintenance("1HGCM82633A004352", "Oil Change", ["Oil Filter"], "Changed engine oil");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const record = contract.getRecord(0);
    expect(record?.vin).toBe("1HGCM82633A004352");
    expect(record?.serviceType).toBe("Oil Change");
    expect(record?.parts).toEqual(["Oil Filter"]);
    expect(record?.details).toBe("Changed engine oil");
    expect(record?.mechanic).toBe("ST1TEST");
    expect(record?.timestamp).toBe(0);
    expect(contract.getRecordsByVin("1HGCM82633A004352")).toEqual([0]);
  });

  it("rejects invalid VIN", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.logMaintenance("INVALIDVIN123456789", "Oil Change", ["Oil Filter"], "Changed engine oil");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VIN);
  });

  it("rejects invalid service type", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.logMaintenance("1HGCM82633A004352", "A".repeat(51), ["Oil Filter"], "Changed engine oil");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SERVICE_TYPE);
  });

  it("rejects invalid parts list", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.logMaintenance("1HGCM82633A004352", "Oil Change", Array(11).fill("Part"), "Changed engine oil");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PARTS);
  });

  it("rejects invalid details", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.logMaintenance("1HGCM82633A004352", "Oil Change", ["Oil Filter"], "A".repeat(201));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DETAILS);
  });

  it("rejects log without authority contract", () => {
    const result = contract.logMaintenance("1HGCM82633A004352", "Oil Change", ["Oil Filter"], "Changed engine oil");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("updates maintenance successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.logMaintenance("1HGCM82633A004352", "Oil Change", ["Oil Filter"], "Changed engine oil");
    const result = contract.updateMaintenance(0, "Tire Rotation", ["Tires"], "Rotated all tires");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const record = contract.getRecord(0);
    expect(record?.serviceType).toBe("Tire Rotation");
    expect(record?.parts).toEqual(["Tires"]);
    expect(record?.details).toBe("Rotated all tires");
    expect(record?.timestamp).toBe(0);
  });

  it("rejects update for non-existent record", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateMaintenance(99, "Tire Rotation", ["Tires"], "Rotated all tires");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_RECORD_NOT_FOUND);
  });

  it("rejects update by non-recorder", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.logMaintenance("1HGCM82633A004352", "Oil Change", ["Oil Filter"], "Changed engine oil");
    contract.caller = "ST3FAKE";
    const result = contract.updateMaintenance(0, "Tire Rotation", ["Tires"], "Rotated all tires");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("returns correct record count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.logMaintenance("1HGCM82633A004352", "Oil Change", ["Oil Filter"], "Changed engine oil");
    contract.logMaintenance("2HGCM82633A004353", "Tire Rotation", ["Tires"], "Rotated all tires");
    const result = contract.getRecordCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });
});