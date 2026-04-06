export const CTI_ENDPOINT = "/api/v2/data/measurements/{measurement}";

export const MEASUREMENTS = [
  "voltage",
  "current",
  "active_power",
  "reactive_power",
  "active_energy",
  "reactive_energy",
  "temperature",
  "pressure",
  "level",
  "tap_position",
  "maneuvers",
  "meter_event",
] as const;

export type Measurement = (typeof MEASUREMENTS)[number];

export const FIELD_FILTERS: Record<string, string[]> = {
  active_energy: ["AI_A", "AI_B", "AI_C", "AI", "AE_A", "AE_B", "AE_C", "AE"],
  reactive_energy: [
    "R1_A", "R1_B", "R1_C", "R1",
    "R2_A", "R2_B", "R2_C", "R2",
    "R3_A", "R3_B", "R3_C", "R3",
    "R4_A", "R4_B", "R4_C", "R4"
  ],
  current: ["I_A", "I_B", "I_C", "I_ABC", "I_N"],
  voltage: ["V_A", "V_B", "V_C", "V_AVG"],
  active_power: ["Pimp_A", "Pimp_B", "Pimp_C", "Pimp_ABC", "Pexp_A", "Pexp_B", "Pexp_C", "Pexp_ABC"],
  reactive_power: ["Qimp_A", "Qimp_B", "Qimp_C", "Qimp_ABC", "Qexp_A", "Qexp_B", "Qexp_C", "Qexp_ABC"],
  set_point: ["SP_V"],
  level: ["L_O"],
  pressure: ["P_O"],
  temperature: ["T_A", "T_C"],
  tap_position: ["TAP_T"],
  maneuvers: ["M_T"],
  meter_event: ["D1", "D2"]
};

export const FIELD_DESCRIPTIONS: Record<string, string> = {
  AI_A: "Activa Importada fase A",
  AI_B: "Activa Importada fase B",
  AI_C: "Activa Importada fase C",
  AI: "Activa Importada fase A,B,C o total",
  AE_A: "Activa Exportada fase A",
  AE_B: "Activa Exportada fase B",
  AE_C: "Activa Exportada fase C",
  AE: "Activa Exportada fase A,B,C",
  R1_A: "Reactiva Cuadrante 1 fase A",
  R1_B: "Reactiva Cuadrante 1 fase B",
  R1_C: "Reactiva Cuadrante 1 fase C",
  R1: "Reactiva Cuadrante 1 fase A,B,C o total",
  R2_A: "Reactiva Cuadrante 2 fase A",
  R2_B: "Reactiva Cuadrante 2 fase B",
  R2_C: "Reactiva Cuadrante 2 fase C",
  R2: "Reactiva Cuadrante 2 fase A,B,C",
  R3_A: "Reactiva Cuadrante 3 fase A",
  R3_B: "Reactiva Cuadrante 3 fase B",
  R3_C: "Reactiva Cuadrante 3 fase C",
  R3: "Reactiva Cuadrante 3 fase A,B,C",
  R4_A: "Reactiva Cuadrante 4 fase A",
  R4_B: "Reactiva Cuadrante 4 fase B",
  R4_C: "Reactiva Cuadrante 4 fase C",
  R4: "Reactiva Cuadrante 4 fase A,B,C",
  I_A: "Corriente fase A",
  I_B: "Corriente fase B",
  I_C: "Corriente fase C",
  I_ABC: "Corriente fase A,B,C",
  I_N: "Corriente Neutro",
  V_A: "Tensión fase A",
  V_B: "Tensión fase B",
  V_C: "Tensión fase C",
  V_AVG: "Tensión fase A,B,C",
  Pimp_A: "Potencia activa importada fase A",
  Pimp_B: "Potencia activa importada fase B",
  Pimp_C: "Potencia activa importada fase C",
  Pimp_ABC: "Potencia activa importada fase A,B,C",
  Pexp_A: "Potencia activa exportada fase A",
  Pexp_B: "Potencia activa exportada fase B",
  Pexp_C: "Potencia activa exportada fase C",
  Pexp_ABC: "Potencia activa exportada fase A,B,C",
  Qimp_A: "Potencia reactiva importada fase A",
  Qimp_B: "Potencia reactiva importada fase B",
  Qimp_C: "Potencia reactiva importada fase C",
  Qimp_ABC: "Potencia reactiva importada fase A,B,C",
  Qexp_A: "Potencia reactiva exportada fase A",
  Qexp_B: "Potencia reactiva exportada fase B",
  Qexp_C: "Potencia reactiva exportada fase C",
  Qexp_ABC: "Potencia reactiva exportada fase A,B,C",
  SP_V: "Consigna Óptima transformador OLTC",
  L_O: "Nivel Aceite transformador OLTC",
  P_O: "Presión aceite transformador OLTC",
  T_A: "Temperatura aceite transformador OLTC",
  T_C: "Temperatura de la tarjeta",
  TAP_T: "Posición del transformador OLTC",
  M_T: "Maniobras del transformador OLTC",
  D1: "Evento del contador D1",
  D2: "Evento del contador D2"
};

export const SENSOR_TYPES = ["DC", "LBT", "TR", "TSC"] as const;
export type SensorType = (typeof SENSOR_TYPES)[number];

export type CtiPlan = {
  measurement: Measurement;
  fieldFilter?: string[];
  tagFilter: {
    sensorType: SensorType;
    meterId?: string;
    cimId?: string;
    dcId?: string;
  };
  start?: string;
  end?: string;
  interval?: string;
  sampling?: string;
  limit?: number;
  offset?: number;
  rationale: string;
};