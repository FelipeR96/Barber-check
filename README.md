# 💈 Barber Check

Sitio sencillo para una barbería, pensado para un solo barbero.

- **Cortes**: registra cada corte que cobras (monto, propina, forma de pago, cliente opcional).
- **Citas**: agenda clientes; al marcar una cita como atendida se registra el cobro.
- **Gastos**: costos fijos, insumos, equipo y otros gastos.
- **Resumen**: ganancia neta, ingresos y gastos del día, la semana y el mes, gráfico de los últimos 14 días y tabla por mes.
- **PIN** de acceso, moneda configurable y respaldo/restauración en JSON.

Sin dependencias ni build: HTML + CSS + JS. Los datos se guardan en el navegador (`localStorage`), así que conviene descargar un respaldo de vez en cuando.

## Usar

Abre `index.html` o sírvelo localmente:

```bash
python -m http.server 5178
```

Para publicarlo gratis: GitHub → Settings → Pages → rama `main`, carpeta raíz.
