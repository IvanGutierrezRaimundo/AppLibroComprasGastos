(function () {
  const e = React.createElement;

  function LoginApp() {
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [pending, setPending] = React.useState(false);
    const [error, setError] = React.useState('');

    async function handleSubmit(event) {
      event.preventDefault();
      setPending(true);
      setError('');

      try {
        const response = await fetch('/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        const data = await response.json().catch(function () {
          return {};
        });

        if (response.ok && data.ok) {
          window.location.href = '/admin/libro-gastos-compras';
          return;
        }

        setError(data.error || 'No se pudo iniciar sesion.');
      } catch (_error) {
        setError('Error de conexion. Intentalo de nuevo.');
      } finally {
        setPending(false);
      }
    }

    return e(
      'div',
      { className: 'card react-login-card' },
      [
        e(
          'div',
          { className: 'react-login-header', key: 'header' },
          [
            e('h1', { className: 'react-login-title', key: 'title' }, 'Libro de gastos y compras'),
          ]
        ),
        e(
          'form',
          { className: 'react-login-form', onSubmit: handleSubmit, key: 'form' },
          [
            e(
              'div',
              { className: 'field', key: 'user-field' },
              [
                e('label', { htmlFor: 'username', key: 'user-label' }, 'Usuario'),
                e('input', {
                  id: 'username',
                  name: 'username',
                  autoComplete: 'username',
                  value: username,
                  onChange: function (event) { setUsername(event.target.value); },
                  disabled: pending,
                  key: 'user-input',
                }),
              ]
            ),
            e(
              'div',
              { className: 'field', key: 'pass-field' },
              [
                e('label', { htmlFor: 'password', key: 'pass-label' }, 'Contrasena'),
                e('input', {
                  id: 'password',
                  name: 'password',
                  type: 'password',
                  autoComplete: 'current-password',
                  value: password,
                  onChange: function (event) { setPassword(event.target.value); },
                  disabled: pending,
                  key: 'pass-input',
                }),
              ]
            ),
            e(
              'div',
              { className: 'react-login-actions', key: 'actions' },
              [
                e(
                  'button',
                  {
                    type: 'submit',
                    className: 'react-login-button',
                    disabled: pending,
                    key: 'submit',
                  },
                  pending ? 'Entrando...' : 'Entrar'
                ),
                e('p', { className: 'react-login-error', role: 'alert', key: 'error' }, error),
              ]
            ),
          ]
        ),
      ]
    );
  }

  const rootNode = document.getElementById('react-login-root');
  if (!rootNode) {
    return;
  }

  const root = ReactDOM.createRoot ? ReactDOM.createRoot(rootNode) : null;
  if (root) {
    root.render(e(LoginApp));
    return;
  }

  ReactDOM.render(e(LoginApp), rootNode);
})();
