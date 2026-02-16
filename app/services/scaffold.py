import json
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.canvas import CanvasComponent
from app.models.scaffold import ScaffoldJob
from app.services.llm import llm_generate
from jinja2 import Environment, BaseLoader

TEMPLATES = {
    "fastapi_service": '''"""{{ name }} - FastAPI Service"""
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="{{ name }}")

{% for model in models %}
class {{ model.name }}(BaseModel):
{% for field in model.fields %}
    {{ field.name }}: {{ field.type }}{% if field.default %} = {{ field.default }}{% endif %}

{% endfor %}

{% endfor %}
{% for endpoint in endpoints %}
@app.{{ endpoint.method }}("{{ endpoint.path }}")
async def {{ endpoint.name }}({% if endpoint.body %}body: {{ endpoint.body }}{% endif %}):
    """{{ endpoint.description }}"""
    return {"status": "ok"}

{% endfor %}
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port={{ port }})
''',
    "react_component": '''import React from "react";
{% if has_state %}import { useState, useEffect } from "react";{% endif %}

{% for type in types %}
interface {{ type.name }} {
{% for field in type.fields %}
  {{ field.name }}: {{ field.ts_type }};
{% endfor %}
}
{% endfor %}

export function {{ name }}() {
{% if has_state %}
  const [data, setData] = useState<{{ main_type }}[]>([]);
  useEffect(() => {
    fetch("{{ api_url }}").then(r => r.json()).then(setData);
  }, []);
{% endif %}
  return (
    <div className="{{ css_class }}">
      <h2>{{ display_name }}</h2>
    </div>
  );
}
''',
    "dockerfile": '''FROM {{ base_image }}
WORKDIR /app
{% for step in build_steps %}
{{ step }}
{% endfor %}
CMD {{ cmd }}
''',
}

jinja_env = Environment(loader=BaseLoader(), autoescape=False)


async def run_scaffold_job(job_id: str, db: AsyncSession):
    result = await db.execute(select(ScaffoldJob).where(ScaffoldJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        return

    job.status = "generating"
    await db.flush()
    await db.commit()

    try:
        component_ids = json.loads(job.component_ids)
        comp_result = await db.execute(
            select(CanvasComponent).where(CanvasComponent.id.in_(component_ids))
        )
        components = comp_result.scalars().all()

        comp_descriptions = []
        for c in components:
            comp_descriptions.append(
                f"- {c.name} (type: {c.component_type}, tech: {c.tech_stack or 'any'}): {c.description or 'No description'}"
            )

        prompt = f"""Given these software components:
{chr(10).join(comp_descriptions)}

Generate a JSON specification for code scaffolding. For each component, output:
{{
  "components": [
    {{
      "name": "component_name",
      "type": "service|frontend|database",
      "tech": "fastapi|react|postgres",
      "port": 8000,
      "models": [{{"name": "ModelName", "fields": [{{"name": "id", "type": "int", "ts_type": "number"}}]}}],
      "endpoints": [{{"method": "get", "path": "/items", "name": "list_items", "description": "List all items", "body": null}}],
      "has_state": true,
      "api_url": "/api/items"
    }}
  ]
}}"""

        spec = await llm_generate(prompt, system="You are a code architect. Output valid JSON only.")
        job.spec_json = json.dumps(spec)

        generated_files = {}
        for comp_spec in spec.get("components", []):
            name = comp_spec.get("name", "unknown")
            tech = comp_spec.get("tech", "fastapi")

            if tech in ("fastapi", "flask", "python"):
                template = jinja_env.from_string(TEMPLATES["fastapi_service"])
                code = template.render(**comp_spec, display_name=name)
                generated_files[f"{name}/main.py"] = code
                df_template = jinja_env.from_string(TEMPLATES["dockerfile"])
                generated_files[f"{name}/Dockerfile"] = df_template.render(
                    base_image="python:3.12-slim",
                    build_steps=["COPY requirements.txt .", "RUN pip install -r requirements.txt", "COPY . ."],
                    cmd=f'["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "{comp_spec.get("port", 8000)}"]',
                )
            elif tech in ("react", "nextjs", "typescript"):
                template = jinja_env.from_string(TEMPLATES["react_component"])
                comp_spec.setdefault("types", comp_spec.get("models", []))
                comp_spec.setdefault("main_type", comp_spec["types"][0]["name"] if comp_spec["types"] else "any")
                comp_spec.setdefault("css_class", name.lower().replace(" ", "-"))
                comp_spec.setdefault("display_name", name)
                code = template.render(**comp_spec)
                generated_files[f"{name}/src/{name}.tsx"] = code

        job.generated_files = json.dumps(generated_files)
        job.status = "review"
        job.completed_at = datetime.now(timezone.utc)

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        job.completed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.commit()
