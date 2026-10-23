"""Bounded, explicit input contracts shared by all transports."""

import re
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator, model_validator

Identifier = Annotated[str, Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_]{0,63}$")]
Text = Annotated[str, Field(min_length=1, max_length=300)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Expr(StrictModel):
    var: Identifier | None = None
    op: Literal["add", "sub", "mul"] | None = None
    args: list["Expr"] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def structure(self) -> Self:
        if self.var is not None:
            if self.op is not None or self.args:
                raise ValueError("Uma referência a variável não pode conter operações.")
        elif self.op is None or len(self.args) < 2:
            raise ValueError("Uma operação requer pelo menos dois argumentos.")
        if self.op == "sub" and len(self.args) != 2:
            raise ValueError("Subtração requer exatamente dois argumentos.")
        return self


class Variable(StrictModel):
    id: Identifier
    label: Text
    unit: Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_ */().^+-]+$")]
    value: FiniteFloat | None = None
    source: Text | None = None

    @field_validator("unit")
    @classmethod
    def bounded_unit(cls, value: str) -> str:
        if any(int(number) > 12 for number in re.findall(r"\d+", value)):
            raise ValueError("Expoentes e fatores de unidade devem ser pequenos (até 12).")
        return value


class Equation(StrictModel):
    id: Identifier
    label: Text
    lhs: Identifier
    rhs: Expr
    assumption_ids: list[Identifier] = Field(default_factory=list, max_length=20)
    source: Text


class Assumption(StrictModel):
    id: Identifier
    label: Text
    justification: Text


class Requirement(StrictModel):
    id: Identifier
    label: Text
    equation_id: Identifier
    exclusion_reason: Text | None = None


class Observation(StrictModel):
    id: Identifier
    label: Text
    variable_id: Identifier
    value: FiniteFloat
    unit: Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_ */().^+-]+$")]
    tolerance: Annotated[FiniteFloat, Field(ge=0)]
    source: Text

    @field_validator("unit")
    @classmethod
    def bounded_unit(cls, value: str) -> str:
        return Variable.bounded_unit(value)


class Model(StrictModel):
    schema_version: Literal[1] = 1
    id: Identifier
    title: Text
    description: Annotated[str, Field(min_length=1, max_length=2000)]
    variables: list[Variable] = Field(min_length=1, max_length=100)
    equations: list[Equation] = Field(max_length=50)
    assumptions: list[Assumption] = Field(max_length=30)
    requirements: list[Requirement] = Field(max_length=30)
    observations: list[Observation] = Field(max_length=30)

    @model_validator(mode="after")
    def bounded_expressions(self) -> Self:
        def count(expr: Expr, depth: int = 0) -> int:
            if depth > 12:
                raise ValueError("Expressão excede a profundidade máxima de 12.")
            return 1 + sum(count(arg, depth + 1) for arg in expr.args)

        if sum(count(eq.rhs) for eq in self.equations) > 1000:
            raise ValueError("Modelo excede o limite de 1.000 termos.")
        return self
