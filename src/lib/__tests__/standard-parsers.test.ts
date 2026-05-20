import { describe, it, expect } from "vitest";
import {
  detectStandardFormat,
  parseOFX,
  parseQIF,
  parseCAMT053,
  parseMT940,
} from "../standard-parsers";

// ─── detectStandardFormat ───

describe("detectStandardFormat", () => {
  it("detects OFX by SGML header", () => {
    expect(detectStandardFormat("OFXHEADER:100\nDATA:OFXSGML\n\n<OFX>")).toBe("ofx");
  });

  it("detects OFX 2.x (XML-wrapped) by root tag", () => {
    expect(detectStandardFormat("<?xml version=\"1.0\"?>\n<OFX>\n  <SIGNONMSGSRSV1>")).toBe("ofx");
  });

  it("detects QIF by !Type header", () => {
    expect(detectStandardFormat("!Type:Bank\nD15/03/2026\nT-45.00\n^\n")).toBe("qif");
  });

  it("detects CAMT.053 by namespace", () => {
    expect(detectStandardFormat("<?xml version=\"1.0\"?><Doc xmlns=\"urn:iso:std:iso:20022:tech:xsd:camt.053.001.08\">")).toBe("camt053");
  });

  it("detects CAMT.053 by root BkToCstmrStmt tag", () => {
    expect(detectStandardFormat("<Document><BkToCstmrStmt>")).toBe("camt053");
  });

  it("detects MT940 by :20: + :61: combination", () => {
    expect(detectStandardFormat(":20:REFERENCE\n:25:ACCOUNT\n:60F:C260401EUR1000,00\n:61:2604010401CR45,00NMSC//REF\n")).toBe("mt940");
  });

  it("does NOT detect MT940 if only :20: is present (too permissive)", () => {
    expect(detectStandardFormat(":20:SOME-REF\n(unrelated content)")).toBeNull();
  });

  it("returns null for regular CSV", () => {
    expect(detectStandardFormat("Fecha,Concepto,Importe\n15/03/2026,Cafe,-3.50\n")).toBeNull();
  });
});

// ─── OFX ───

describe("parseOFX", () => {
  it("parses a typical OFX 1.x SGML file", () => {
    const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>EUR
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260315120000
<TRNAMT>-45.50
<FITID>REF123
<NAME>Supermercado
<MEMO>Compra semanal
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260316000000
<TRNAMT>2500.00
<FITID>REF124
<NAME>Nomina
</STMTTRN>
<LEDGERBAL>
<BALAMT>3200.50
<DTASOF>20260316000000
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
    const result = parseOFX(ofx);
    expect(result.format).toBe("ofx");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      date: "2026-03-15",
      description: expect.stringContaining("Supermercado"),
      amount: 45.5,
      direction: "expense",
      currency: "EUR",
    });
    expect(result.transactions[1]).toMatchObject({
      date: "2026-03-16",
      amount: 2500,
      direction: "income",
    });
    expect(result.finalBalances?.ofx).toBe(3200.5);
  });

  it("parses OFX 2.x XML variant with closing tags", () => {
    const ofx = `<?xml version="1.0"?>
<OFX>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260315</DTPOSTED>
<TRNAMT>-12.00</TRNAMT>
<NAME>Cafe</NAME>
</STMTTRN>
</OFX>`;
    const result = parseOFX(ofx);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(12);
    expect(result.transactions[0].direction).toBe("expense");
  });

  it("returns error when no transactions found", () => {
    const result = parseOFX("<OFX></OFX>");
    expect(result.transactions).toHaveLength(0);
    expect(result.errors[0]).toMatch(/No se encontraron/);
  });
});

// ─── QIF ───

describe("parseQIF", () => {
  it("parses European-style QIF", () => {
    const qif = `!Type:Bank
D15/03/2026
T-45.50
PSupermercado
MCompra semanal
LAlimentacion
^
D16/03/2026
T2500.00
PEmpresa SL
MNomina
^
`;
    const result = parseQIF(qif);
    expect(result.format).toBe("qif");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].date).toBe("2026-03-15");
    expect(result.transactions[0].amount).toBe(45.5);
    expect(result.transactions[0].direction).toBe("expense");
    expect(result.transactions[1].date).toBe("2026-03-16");
    expect(result.transactions[1].direction).toBe("income");
  });

  it("handles Quicken shorthand dates DD/MM'YY", () => {
    const qif = `!Type:Bank
D15/03'26
T-10,00
PCafe
^
`;
    const result = parseQIF(qif);
    expect(result.transactions[0].date).toBe("2026-03-15");
    expect(result.transactions[0].amount).toBe(10);
  });
});

// ─── CAMT.053 ───

describe("parseCAMT053", () => {
  it("parses a minimal SEPA CAMT.053", () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Acct><Ccy>EUR</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1234.56</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">45.50</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <ValDt><Dt>2026-03-15</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <RmtInf><Ustrd>Supermercado</Ustrd></RmtInf>
            <RltdPties><Cdtr><Nm>Mercadona</Nm></Cdtr></RltdPties>
          </TxDtls>
        </NtryDtls>
        <AddtlNtryInf>Compra semanal</AddtlNtryInf>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">2500.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-16</Dt></BookgDt>
        <ValDt><Dt>2026-03-16</Dt></ValDt>
        <AddtlNtryInf>Nomina</AddtlNtryInf>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
    const result = parseCAMT053(xml);
    expect(result.format).toBe("camt053");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      date: "2026-03-15",
      amount: 45.5,
      direction: "expense",
      currency: "EUR",
    });
    expect(result.transactions[0].description).toMatch(/Supermercado|Compra semanal/);
    expect(result.transactions[1]).toMatchObject({
      date: "2026-03-16",
      amount: 2500,
      direction: "income",
    });
    expect(result.finalBalances?.camt053).toBe(1234.56);
  });

  it("handles namespace prefixes", () => {
    const xml = `<ns0:Document xmlns:ns0="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <ns0:BkToCstmrStmt><ns0:Stmt>
    <ns0:Ntry>
      <ns0:Amt Ccy="EUR">10.00</ns0:Amt>
      <ns0:CdtDbtInd>DBIT</ns0:CdtDbtInd>
      <ns0:BookgDt><ns0:Dt>2026-03-17</ns0:Dt></ns0:BookgDt>
      <ns0:AddtlNtryInf>Test</ns0:AddtlNtryInf>
    </ns0:Ntry>
  </ns0:Stmt></ns0:BkToCstmrStmt>
</ns0:Document>`;
    const result = parseCAMT053(xml);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(10);
    expect(result.transactions[0].direction).toBe("expense");
  });
});

// ─── MT940 ───

describe("parseMT940", () => {
  it("parses a typical MT940 statement", () => {
    const mt940 = `:20:REFERENCE-123
:25:ES9121000418450200051332
:28C:00001/001
:60F:C260401EUR1000,00
:61:2604020402D45,50NMSCREF001
:86:Supermercado Mercadona compra semanal
:61:2604030403C2500,00NTRFNOMINA
:86:Transferencia nomina empresa SL
:62F:C260430EUR3454,50
-`;
    const result = parseMT940(mt940);
    expect(result.format).toBe("mt940");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      date: "2026-04-02",
      amount: 45.5,
      direction: "expense",
      currency: "EUR",
    });
    expect(result.transactions[0].description).toMatch(/Mercadona|Supermercado/);
    expect(result.transactions[1]).toMatchObject({
      date: "2026-04-03",
      amount: 2500,
      direction: "income",
    });
    expect(result.finalBalances?.mt940).toBe(3454.5);
  });

  it("handles continuation lines in :86: field", () => {
    const mt940 = `:20:REF
:60F:C260401EUR1000,00
:61:2604020402D45,50NMSCREF001
:86:Supermercado Mercadona
compra semanal de alimentacion
:62F:C260430EUR954,50
-`;
    const result = parseMT940(mt940);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toMatch(/alimentacion/);
  });
});
