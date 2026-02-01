import { useState } from 'react'
import { useProjects } from '../../hooks/useProjects'
import { useTasks } from '../../hooks/useTasks'

export function ProjectSelector() {
  const { projects, loading, addProject, fetchProjects } = useProjects()
  const { projectFilter, setProjectFilter } = useTasks()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPath, setNewPath] = useState('')

  const handleAddProject = async () => {
    if (!newName.trim() || !newPath.trim()) return
    await addProject(newName.trim(), newPath.trim())
    setNewName('')
    setNewPath('')
    setShowAddForm(false)
  }

  const selectedProject = projects.find(p => p.id === projectFilter)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Project</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs text-blue-600 hover:text-blue-700"
        >
          {showAddForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAddForm && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="/path/to/project"
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleAddProject}
            disabled={!newName.trim() || !newPath.trim()}
            className="w-full px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Add Project
          </button>
        </div>
      )}

      <select
        value={projectFilter || ''}
        onChange={(e) => setProjectFilter(e.target.value || null)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
        disabled={loading}
      >
        <option value="">All Projects</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>

      {selectedProject && (
        <div className="mt-2 text-xs text-gray-500 truncate" title={selectedProject.path}>
          {selectedProject.path}
        </div>
      )}
    </div>
  )
}
