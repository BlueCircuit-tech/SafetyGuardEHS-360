import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './componentes/Layout';
import { ProvedorToast } from './componentes/Toast';
import { EmpresaPage } from './paginas/EmpresaPage';
import { ClientesPage } from './paginas/ClientesPage';
import { ClienteFormPage } from './paginas/ClienteFormPage';
import { TerceirosPage } from './paginas/TerceirosPage';
import { TerceiroFormPage } from './paginas/TerceiroFormPage';

export function App() {
  return (
    <ProvedorToast>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/empresa" replace />} />
            <Route path="empresa" element={<EmpresaPage />} />
            <Route path="clientes" element={<ClientesPage />} />
            <Route path="clientes/novo" element={<ClienteFormPage />} />
            <Route path="clientes/:id" element={<ClienteFormPage />} />
            <Route path="terceiros" element={<TerceirosPage />} />
            <Route path="terceiros/novo" element={<TerceiroFormPage />} />
            <Route path="terceiros/:id" element={<TerceiroFormPage />} />
            <Route path="*" element={<Navigate to="/empresa" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ProvedorToast>
  );
}
