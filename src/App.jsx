import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import {
  Calendar,
  Users,
  Box,
  AlertTriangle,
  CheckCircle,
  Activity,
  Download,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { fetchData } from './api';

// --- COMPONENTES UI ---

const Card = ({ title, value, subtext, icon: Icon, colorClass, trend }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-start justify-between">
    <div>
      <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      {subtext && <p className={`text-xs mt-2 ${trend === 'bad' ? 'text-red-500' : 'text-emerald-500'}`}>{subtext}</p>}
    </div>
    <div className={`p-3 rounded-lg ${colorClass}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
  </div>
);

export default function App() {
  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState({ production: [], rejections: [] });
  const [error, setError] = useState(null);

  // Estados para filtros (ahora arrays para selección múltiple)
  const [filtroOperarios, setFiltroOperarios] = useState([]);
  const [filtroModelos, setFiltroModelos] = useState([]);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  // Estados para controlar dropdowns
  const [dropdownOperariosOpen, setDropdownOperariosOpen] = useState(false);
  const [dropdownModelosOpen, setDropdownModelosOpen] = useState(false);


  // Helper para buscar claves confusas
  const guessKey = (obj, candidates) => {
    if (!obj) return undefined;
    const keys = Object.keys(obj);
    for (const cand of candidates) {
      const found = keys.find(k => k.toLowerCase().includes(cand.toLowerCase()));
      if (found) return obj[found];
    }
    return undefined;
  };

  // Cargar datos al inicio
  useEffect(() => {
    fetchData()
      .then(data => {
        // Adaptar estructura con fuzzy matching
        const mapProduction = (list) => {
          if (!Array.isArray(list)) return [];
          return list.map(item => ({
            ...item,
            fecha: guessKey(item, ['marca', 'fecha', 'time']) || '',
            modelo: guessKey(item, ['modelo', 'producto', 'item', 'descripcion']) || 'Desconocido',
            operario: guessKey(item, ['operario', 'nombre', 'empleado', 'responsable']) || 'Sin Asignar',
            cantidad: Number(guessKey(item, ['cantidad', 'producida', 'total', 'unidades'])) || 0
          }));
        };

        const mapRejections = (list) => {
          if (!Array.isArray(list)) return [];
          return list.map(item => ({
            ...item,
            fecha: guessKey(item, ['marca', 'fecha', 'time']) || '',
            modelo: guessKey(item, ['modelo', 'producto', 'item', 'descripcion']) || 'Desconocido',
            operario: guessKey(item, ['operario', 'nombre', 'empleado', 'responsable']) || 'Sin Asignar',
            cantidad: Number(guessKey(item, ['cantidad', 'rechaza', 'descarte', 'falla'])) || 1, // Default 1 
            motivo: guessKey(item, ['motivo', 'falla', 'causa', 'codigo']) || 'Desconocido'
          }));
        };

        const prodData = mapProduction(data.production);
        const rejData = mapRejections(data.rejections);

        setRawData({
          production: prodData,
          rejections: rejData
        });

        // Debug
        if (prodData.length > 0) {
          console.log("Prod Keys:", Object.keys(data.production[0]));
          console.log("Mapped Item:", prodData[0]);
        }

        if (prodData.length > 0) {
          const fechas = prodData
            .map(d => formatDateIso(d.fecha))
            .filter(f => f)
            .sort();

          if (fechas.length > 0) {
            setFechaInicio(fechas[0]);
            setFechaFin(fechas[fechas.length - 1]);
          } else {
            const hoy = new Date().toISOString().split('T')[0];
            setFechaInicio(hoy);
            setFechaFin(hoy);
          }
        } else {
          const hoy = new Date().toISOString().split('T')[0];
          setFechaInicio(hoy);
          setFechaFin(hoy);
        }

        setLoading(false);
      })
      .catch(err => {
        setError('Error al cargar datos: ' + err.message);

        setLoading(false);
      });
  }, []);

  // Helpers para normalizar datos
  const normalizeText = (txt) => String(txt || '').trim();
  const formatDateIso = (dateInput) => {
    // Intenta convertir a YYYY-MM-DD
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput).substring(0, 10); // Fallback string
    return d.toISOString().split('T')[0];
  };


  const operariosUnicos = [...new Set(rawData.production.map(d => d.operario))].filter(Boolean);
  const modelosUnicos = [...new Set(rawData.production.map(d => d.modelo))].filter(Boolean);

  // Funciones para manejar selección múltiple
  const toggleOperario = (operario) => {
    setFiltroOperarios(prev =>
      prev.includes(operario)
        ? prev.filter(o => o !== operario)
        : [...prev, operario]
    );
  };

  const toggleModelo = (modelo) => {
    setFiltroModelos(prev =>
      prev.includes(modelo)
        ? prev.filter(m => m !== modelo)
        : [...prev, modelo]
    );
  };


  // --- LÓGICA PRINCIPAL DE MERGE (MECHAR DATOS) ---
  const datosProcesados = useMemo(() => {
    if (loading || !rawData.production.length) return [];

    // 1. Filtrar primero por fechas
    const prodFiltrada = rawData.production.filter(p => {
      const f = formatDateIso(p.fecha);
      return f >= fechaInicio && f <= fechaFin;
    });

    // 2. Procesar y combinar
    let datosCombinados = prodFiltrada.map(prod => {
      const pFecha = formatDateIso(prod.fecha);
      const pOp = normalizeText(prod.operario);
      const pMod = normalizeText(prod.modelo);

      // Buscar rechazos coincidentes
      // Nota: Puede haber multiples registros de rechazo para el mismo lote?
      // Asumimos suma de rechazos si coinciden claves
      const rechazosCoincidentes = rawData.rejections.filter(r =>
        formatDateIso(r.fecha) === pFecha &&
        normalizeText(r.operario) === pOp &&
        normalizeText(r.modelo) === pMod
      );

      const totalRechazado = rechazosCoincidentes.reduce((acc, curr) => acc + (Number(curr.cantidad) || Number(curr.cantidadRechazada) || 0), 0);
      const motivoPrincipal = rechazosCoincidentes.length > 0 ? rechazosCoincidentes[0].motivo : '-';

      const cantidadProd = Number(prod.cantidad) || 0;
      const porcentaje = cantidadProd > 0 ? ((totalRechazado / cantidadProd) * 100).toFixed(2) : 0;

      return {
        ...prod,
        fecha: pFecha, // Usar fecha normalizada para usar en graficos
        cantidad: cantidadProd,
        rechazos: totalRechazado,
        porcentajeRechazo: parseFloat(porcentaje),
        motivoPrincipal: motivoPrincipal
      };
    });

    // 3. Aplicar filtros de UI (Operario y Modelo) - Selección múltiple
    if (filtroOperarios.length > 0) {
      datosCombinados = datosCombinados.filter(d => filtroOperarios.includes(d.operario));
    }
    if (filtroModelos.length > 0) {
      datosCombinados = datosCombinados.filter(d => filtroModelos.includes(d.modelo));
    }

    return datosCombinados;
  }, [rawData, filtroOperarios, filtroModelos, fechaInicio, fechaFin, loading]);

  // --- DATOS PARA GRÁFICOS ---

  const datosPorModelo = useMemo(() => {
    const agrupado = {};
    datosProcesados.forEach(d => {
      if (!agrupado[d.modelo]) {
        agrupado[d.modelo] = { name: d.modelo, Producción: 0, Rechazos: 0 };
      }
      agrupado[d.modelo].Producción += d.cantidad;
      agrupado[d.modelo].Rechazos += d.rechazos;
    });
    return Object.values(agrupado);
  }, [datosProcesados]);

  // Totales
  const totalProduccion = datosProcesados.reduce((acc, curr) => acc + curr.cantidad, 0);
  const totalRechazos = datosProcesados.reduce((acc, curr) => acc + curr.rechazos, 0);
  const porcentajeGlobal = totalProduccion > 0 ? ((totalRechazos / totalProduccion) * 100).toFixed(2) : 0;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-slate-500">Cargando datos de producción...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-red-50 p-6 rounded-lg border border-red-200 text-red-700 max-w-md">
        <h3 className="font-bold mb-2 flex items-center gap-2"><AlertTriangle /> Error</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">Reintentar</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800">
      {/* HEADER */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard de Producción</h1>
          <p className="text-slate-500 mt-1">Análisis de Calidad y Rendimiento</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-white border border-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 text-slate-700 transition-colors">
            <Download size={16} />
            Exportar
          </button>
          <button onClick={() => window.location.reload()} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
            <Activity size={16} />
            Actualizar
          </button>
        </div>
      </header>

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-8">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Fecha Inicio</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
              <input type="date" className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-blue-500" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </div>
          </div>
          <div className="w-full md:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Fecha Fin</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
              <input type="date" className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-blue-500" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            </div>
          </div>
          {/* Dropdown Operarios */}
          <div className="w-full md:w-64 relative">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Operarios
            </label>
            <button
              onClick={() => setDropdownOperariosOpen(!dropdownOperariosOpen)}
              className="w-full flex items-center justify-between px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white hover:bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-slate-700">
                  {filtroOperarios.length > 0 ? `${filtroOperarios.length} seleccionado(s)` : 'Todos'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOperariosOpen ? 'rotate-180' : ''}`} />
            </button>
            {dropdownOperariosOpen && (
              <div className="absolute z-10 mt-1 w-full border border-slate-200 rounded-lg bg-white shadow-lg max-h-60 overflow-y-auto">
                {operariosUnicos.map(op => (
                  <label key={op} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filtroOperarios.includes(op)}
                      onChange={() => toggleOperario(op)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">{op}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Dropdown Modelos */}
          <div className="w-full md:w-64 relative">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
              Modelos
            </label>
            <button
              onClick={() => setDropdownModelosOpen(!dropdownModelosOpen)}
              className="w-full flex items-center justify-between px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white hover:bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-slate-400" />
                <span className="text-slate-700">
                  {filtroModelos.length > 0 ? `${filtroModelos.length} seleccionado(s)` : 'Todos'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${dropdownModelosOpen ? 'rotate-180' : ''}`} />
            </button>
            {dropdownModelosOpen && (
              <div className="absolute z-10 mt-1 w-full border border-slate-200 rounded-lg bg-white shadow-lg max-h-60 overflow-y-auto">
                {modelosUnicos.map(mod => (
                  <label key={mod} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filtroModelos.includes(mod)}
                      onChange={() => toggleModelo(mod)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">{mod}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="w-full md:w-auto ml-auto">
            <button
              onClick={() => {
                setFiltroModelos([]);
                setFiltroOperarios([]);
                setDropdownOperariosOpen(false);
                setDropdownModelosOpen(false);
              }}
              className="text-sm text-slate-500 hover:text-blue-600 underline"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card title="Producción Total" value={totalProduccion.toLocaleString()} subtext="Unidades producidas" icon={CheckCircle} colorClass="bg-blue-500" trend="good" />
        <Card title="Total Rechazos" value={totalRechazos} subtext="Unidades descartadas" icon={AlertTriangle} colorClass="bg-red-500" trend="bad" />
        <Card title="% Tasa de Rechazo" value={`${porcentajeGlobal}%`} subtext={parseFloat(porcentajeGlobal) > 2.5 ? "Por encima del objetivo (2.5%)" : "Dentro del objetivo"} icon={Activity} colorClass={parseFloat(porcentajeGlobal) > 2.5 ? "bg-amber-500" : "bg-emerald-500"} trend={parseFloat(porcentajeGlobal) > 2.5 ? "bad" : "good"} />
      </div>

      {/* GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96">
          <h3 className="font-bold text-lg mb-6 text-slate-800">Producción vs. Rechazos</h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={datosPorModelo} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f1f5f9' }} />
              <Legend />
              <Bar dataKey="Producción" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
              <Bar dataKey="Rechazos" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96">
          <h3 className="font-bold text-lg mb-6 text-slate-800">Evolución del Rechazo</h3>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={datosProcesados} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="fecha" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} unit="%" />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Line type="monotone" dataKey="porcentajeRechazo" name="% Rechazo" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABLA DETALLADA */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-800">Detalle de Operaciones</h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full">{datosProcesados.length} Registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Operario</th>
                <th className="px-6 py-4">Modelo</th>
                <th className="px-6 py-4 text-right">Producido</th>
                <th className="px-6 py-4 text-right">Rechazado</th>
                <th className="px-6 py-4 text-right">% Rechazo</th>
                <th className="px-6 py-4">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datosProcesados.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">{row.fecha}</td>
                  <td className="px-6 py-4 font-medium text-slate-900">{row.operario}</td>
                  <td className="px-6 py-4"><span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-semibold border border-blue-100">{row.modelo}</span></td>
                  <td className="px-6 py-4 text-right">{row.cantidad}</td>
                  <td className="px-6 py-4 text-right">{row.rechazos > 0 ? <span className="text-red-600 font-bold">{row.rechazos}</span> : <span className="text-slate-300">-</span>}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`font-medium ${row.porcentajeRechazo > 2 ? 'text-red-500' : 'text-emerald-600'}`}>{row.porcentajeRechazo}%</span>
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${row.porcentajeRechazo > 2 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(row.porcentajeRechazo, 100)}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">{row.motivoPrincipal}</td>
                </tr>
              ))}
              {datosProcesados.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400">No se encontraron datos con los filtros seleccionados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
