import { Layout } from './componentes/Layout';
import { ProvedorToast } from './componentes/Toast';
import { EmpresaPage } from './paginas/EmpresaPage';

export function App() {
  return (
    <ProvedorToast>
      <Layout>
        <EmpresaPage />
      </Layout>
    </ProvedorToast>
  );
}
