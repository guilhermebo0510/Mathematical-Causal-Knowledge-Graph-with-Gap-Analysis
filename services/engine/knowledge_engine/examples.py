"""Synthetic, educational fixtures; no claim of empirical discovery."""

from copy import deepcopy

from .schema import Model


def ref(name: str) -> dict:
    return {"var": name}


def operation(op: str, *names: str) -> dict:
    return {"op": op, "args": [ref(name) for name in names]}


SOURCE = "Exemplo sintético versionado: balanço térmico v1 (sem dados experimentais)."
BASE = {
    "schema_version": 1,
    "id": "thermal_pilot",
    "title": "Balanço térmico de uma sala",
    "description": (
        "Modelo didático estacionário, sem ganhos solares ou internos. "
        "Transmissão e troca de ar são exigidas pelo contrato de cobertura. "
        "Não inclui transientes, umidade ou eficiência do sistema de climatização."
    ),
    "variables": [
        {
            "id": "U",
            "label": "Transmitância térmica",
            "unit": "W / (m ** 2 * K)",
            "value": 0.5,
            "source": SOURCE,
        },
        {
            "id": "A",
            "label": "Área da envoltória",
            "unit": "m ** 2",
            "value": 100,
            "source": SOURCE,
        },
        {
            "id": "delta_T",
            "label": "Diferença de temperatura",
            "unit": "K",
            "value": 20,
            "source": SOURCE,
        },
        {
            "id": "rho",
            "label": "Densidade do ar",
            "unit": "kg / m ** 3",
            "value": 1.2,
            "source": SOURCE,
        },
        {
            "id": "cp",
            "label": "Calor específico do ar",
            "unit": "J / (kg * K)",
            "value": 1000,
            "source": SOURCE,
        },
        {
            "id": "flow",
            "label": "Vazão de troca de ar",
            "unit": "m ** 3 / s",
            "value": 0.05,
            "source": SOURCE,
        },
        {"id": "P_wall", "label": "Potência por transmissão", "unit": "W"},
        {"id": "P_air", "label": "Potência por troca de ar", "unit": "W"},
        {"id": "P_total", "label": "Potência térmica total", "unit": "W"},
    ],
    "equations": [
        {
            "id": "eq_wall",
            "label": "Transmissão: U · A · ΔT",
            "lhs": "P_wall",
            "rhs": operation("mul", "U", "A", "delta_T"),
            "assumption_ids": ["steady"],
            "source": SOURCE,
        },
        {
            "id": "eq_air",
            "label": "Troca de ar: ρ · cp · vazão · ΔT",
            "lhs": "P_air",
            "rhs": operation("mul", "rho", "cp", "flow", "delta_T"),
            "assumption_ids": ["steady"],
            "source": SOURCE,
        },
        {
            "id": "eq_total",
            "label": "Balanço: transmissão + troca de ar",
            "lhs": "P_total",
            "rhs": operation("add", "P_wall", "P_air"),
            "assumption_ids": ["steady"],
            "source": SOURCE,
        },
    ],
    "assumptions": [
        {
            "id": "steady",
            "label": "Regime estacionário",
            "justification": "Hipótese didática declarada; ganhos solares e internos nulos.",
        }
    ],
    "requirements": [
        {"id": "req_wall", "label": "Avaliar transmissão", "equation_id": "eq_wall"},
        {"id": "req_air", "label": "Avaliar troca de ar", "equation_id": "eq_air"},
    ],
    "observations": [
        {
            "id": "obs_total",
            "label": "Referência sintética: 2.200 W",
            "variable_id": "P_total",
            "value": 2200,
            "unit": "W",
            "tolerance": 1,
            "source": SOURCE,
        }
    ],
}
CATALOG = [
    {"id": "complete", "label": "Modelo completo", "description": "Referência: 2.200 W."},
    {"id": "missing_input", "label": "Entrada ausente", "description": "Transmitância sem valor."},
    {
        "id": "invalid_unit",
        "label": "Unidade incompatível",
        "description": "Área informada em metros.",
    },
    {
        "id": "missing_air",
        "label": "Troca de ar omitida",
        "description": "Cobertura insuficiente e divergência de 1.200 W.",
    },
]


def load_example(name: str) -> Model:
    if name not in {item["id"] for item in CATALOG}:
        raise ValueError("Exemplo desconhecido.")
    data = deepcopy(BASE)
    if name == "missing_input":
        data["variables"][0].pop("value")
    elif name == "invalid_unit":
        data["variables"][1]["unit"] = "m"
    elif name == "missing_air":
        data["equations"] = [eq for eq in data["equations"] if eq["id"] != "eq_air"]
        data["equations"][-1]["rhs"] = ref("P_wall")
    return Model.model_validate(data)
