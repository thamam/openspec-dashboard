import React, { useState } from 'react';
import './CreateChangeForm.css';

interface CreateChangeFormProps {
  repoPath: string;
  onCreateSuccess: (changeName: string) => void;
  onCancel: () => void;
}

export default function CreateChangeForm({
  repoPath,
  onCreateSuccess,
  onCancel,
}: CreateChangeFormProps) {
  const [changeName, setChangeName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'predefined' | 'custom'>('predefined');
  const [schemaName, setSchemaName] = useState('spec-driven');
  const [proposeEngine, setProposeEngine] = useState('gemini');
  const [artifacts, setArtifacts] = useState({
    proposal: true,
    specs: true,
    design: true,
    tasks: true,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleArtifactChange = (key: keyof typeof artifacts) => {
    setArtifacts((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');



    // 1. Validation
    const cleanName = changeName.trim();
    if (!cleanName) {
      setError('Change name is required.');
      return;
    }

    const nameRegex = /^[a-zA-Z0-9.-]+$/;
    if (!nameRegex.test(cleanName)) {
      setError('Change name must contain only letters, numbers, dots, and hyphens (no spaces).');
      return;
    }

    const selectedArtifacts = Object.keys(artifacts).filter(
      (k) => artifacts[k as keyof typeof artifacts]
    );

    if (mode === 'custom' && selectedArtifacts.length === 0) {
      setError('Select at least one state/artifact for custom workflow.');
      return;
    }

    setSubmitting(true);

    try {
      let activeSchema = schemaName;

      // 2. If custom mode, initialize local schema first
      if (mode === 'custom') {
        activeSchema = `schema-${selectedArtifacts.join('-')}`;
        
        const schemaRes = await fetch('/api/schema', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoPath,
            schemaName: activeSchema,
            artifacts: selectedArtifacts,
          }),
        });

        if (!schemaRes.ok) {
          const errData = await schemaRes.json();
          throw new Error(errData.error || 'Failed to initialize local schema');
        }
      }

      // 3. Create change proposal
      const changeRes = await fetch('/api/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath,
          changeName: cleanName,
          schemaName: activeSchema,
          description: description.trim(),
          proposeEngine,
        }),
      });

      if (!changeRes.ok) {
        const errData = await changeRes.json();
        throw new Error(errData.error || 'Failed to create change proposal');
      }

      onCreateSuccess(cleanName);
    } catch (err: any) {
      console.error('Form submission failed:', err);
      setError(err.message || 'An error occurred during submission.');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <form className="create-change-form" onSubmit={handleSubmit}>
      <h3>Create Change Proposal</h3>

      <div className="form-group">
        <label htmlFor="change-name-input">Change Name (kebab-case):</label>
        <input
          id="change-name-input"
          type="text"
          placeholder="e.g., add-user-login"
          value={changeName}
          onChange={(e) => setChangeName(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="form-group">
        <label htmlFor="change-desc-input">Description (optional):</label>
        <input
          id="change-desc-input"
          type="text"
          placeholder="Describe what you want to build..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="form-group">
        <label htmlFor="propose-engine-select">AI Propose Engine:</label>
        <select
          id="propose-engine-select"
          value={proposeEngine}
          onChange={(e) => setProposeEngine(e.target.value)}
          disabled={submitting}
        >
          <option value="gemini">Gemini (AGY)</option>
          <option value="claude">Claude Code</option>
          <option value="cursor">Cursor</option>
          <option value="codex">Codex</option>
        </select>
      </div>

      <div className="form-group">
        <label>Workflow Mode:</label>
        <div className="radio-group">
          <label className="radio-option">
            <input
              type="radio"
              name="mode"
              checked={mode === 'predefined'}
              onChange={() => setMode('predefined')}
              disabled={submitting}
            />
            Standard Workflow
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="mode"
              checked={mode === 'custom'}
              onChange={() => setMode('custom')}
              disabled={submitting}
            />
            Custom States
          </label>
        </div>
      </div>

      {mode === 'predefined' ? (
        <div className="form-group">
          <label htmlFor="schema-select">Workflow Schema:</label>
          <select
            id="schema-select"
            value={schemaName}
            onChange={(e) => setSchemaName(e.target.value)}
            disabled={submitting}
          >
            <option value="spec-driven">spec-driven (proposal → specs → design → tasks)</option>
            <option value="workspace-planning">workspace-planning (proposal → specs → design → tasks)</option>
          </select>
        </div>
      ) : (
        <div className="form-group">
          <label>Select workflow states/artifacts to generate:</label>
          <div className="checkbox-grid">
            <div className="checkbox-option">
              <input
                id="check-proposal"
                type="checkbox"
                checked={artifacts.proposal}
                onChange={() => handleArtifactChange('proposal')}
                disabled={submitting}
              />
              <label htmlFor="check-proposal">proposal</label>
            </div>
            <div className="checkbox-option">
              <input
                id="check-specs"
                type="checkbox"
                checked={artifacts.specs}
                onChange={() => handleArtifactChange('specs')}
                disabled={submitting}
              />
              <label htmlFor="check-specs">specs</label>
            </div>
            <div className="checkbox-option">
              <input
                id="check-design"
                type="checkbox"
                checked={artifacts.design}
                onChange={() => handleArtifactChange('design')}
                disabled={submitting}
              />
              <label htmlFor="check-design">design</label>
            </div>

            <div className="checkbox-option">
              <input
                id="check-tasks"
                type="checkbox"
                checked={artifacts.tasks}
                onChange={() => handleArtifactChange('tasks')}
                disabled={submitting}
              />
              <label htmlFor="check-tasks">tasks</label>
            </div>
          </div>


        </div>
      )}

      {error && <span className="error-message">{error}</span>}

      <div className="button-group">
        <button type="button" className="btn-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-submit" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Change'}
        </button>
      </div>
    </form>
  );
}
