# 💈 Barber Check

Sitio sencillo para una barbería, pensado para un solo barbero.

- **Cortes**: registra cada corte que cobras (monto, propina, forma de pago, cliente opcional).
- **Citas**: agenda clientes; al marcar una cita como atendida se registra el cobro.
- **Gastos**: costos fijos, insumos, equipo y otros gastos.
- **Resumen**: ganancia neta, ingresos y gastos del día, la semana y el mes, gráfico de los últimos 14 días y tabla por mes.
- **Cuenta** con correo y contraseña + **PIN** por dispositivo para desbloquear rápido.
- Moneda configurable y respaldo/restauración en JSON.

Sin build: HTML + CSS + JS. Los datos se guardan en **Supabase** (Postgres) con Row Level Security: cada cuenta solo puede leer y escribir sus propias filas. La configuración del proyecto está en `config.js` (la clave publicable es segura en el navegador).

Tablas: `cuts`, `appts`, `expenses`, `settings`.

## Usar

Abre `index.html` o sírvelo localmente:

```bash
python -m http.server 5178
```

Para publicarlo gratis: GitHub → Settings → Pages → rama `main`, carpeta raíz.
