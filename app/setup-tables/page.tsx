'use client'

import { useState } from 'react'

export default function SetupTablesPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSetup = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/setup-tables', {
        method: 'POST'
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro desconhecido')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '20px' }}>Configuração das Tabelas de Feedback</h1>

      <p style={{ marginBottom: '20px', color: '#666' }}>
        As tabelas para Central de Sugestões e Pesquisas de Satisfação precisam ser criadas no banco de dados.
        Clique no botão abaixo para obter as instruções e o script SQL.
      </p>

      <button
        onClick={handleSetup}
        disabled={loading}
        style={{
          padding: '10px 20px',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '16px'
        }}
      >
        {loading ? 'Carregando...' : 'Obter Script SQL'}
      </button>

      {error && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '5px',
          color: '#c33'
        }}>
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#efe',
          border: '1px solid #cfc',
          borderRadius: '5px'
        }}>
          <h3 style={{ marginTop: 0 }}>Instruções:</h3>
          <p>{result.instructions}</p>

          <h3>Script SQL:</h3>
          <pre style={{
            backgroundColor: '#f5f5f5',
            padding: '10px',
            borderRadius: '5px',
            overflow: 'auto',
            fontSize: '12px',
            maxHeight: '400px'
          }}>
            {result.sql}
          </pre>

          <div style={{ marginTop: '15px' }}>
            <a
              href="https://supabase.com/dashboard/project/ewsmydxoghwzjvuprjsa/sql"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '10px 15px',
                backgroundColor: '#0070f3',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '5px',
                fontWeight: 'bold'
              }}
            >
              Abrir Painel SQL do Supabase →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}