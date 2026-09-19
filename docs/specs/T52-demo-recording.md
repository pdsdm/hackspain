# T52: integración, ensayo y grabación final

## Qué y para qué

Unir los carriles, verificar el recorrido con runs HappyRobot y obtener una toma maestra y un respaldo antes de considerar lista la entrega.

## Criterios de aceptación

- [ ] Desde `calm`, dos runs HappyRobot simulados crean los incidentes una sola vez.
- [ ] Se observan dos ciclos de plan y el segundo incorpora ambos fallos.
- [ ] Mapa, KPIs, incidencias, cuatro especialistas y compromisos son coherentes.
- [ ] Runs, canal, actor y evidencia aparecen; las acciones `sim` están etiquetadas.
- [ ] Final `cerrado` o `condicionado` explica plazas, servicio y pendientes sin falsa resolución.
- [ ] El recorrido completo se repite tres veces; `make check` pasa.
- [ ] Se graban toma maestra HappyRobot y respaldo API simulado etiquetado.
- [ ] Voz/subtítulos no afirman como real lo simulado y no muestran secretos.

## Fuera de alcance

Activar T44 para aplicar planes, benchmark de modelos o añadir nuevas features después de congelar la toma.
