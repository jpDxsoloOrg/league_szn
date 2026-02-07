import { useState, useEffect, useCallback } from 'react';
import { usersApi } from '../../services/api';
import './ManageUsers.css';

interface CognitoUser {
  username: string;
  email: string;
  name: string;
  wrestlerName: string;
  status: string;
  enabled: boolean;
  created: string;
  groups: string[];
}

type FilterTab = 'all' | 'wrestler-requests' | 'wrestlers' | 'admins';

export default function ManageUsers() {
  const [users, setUsers] = useState<CognitoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await usersApi.list();
      setUsers(result.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleAction = async (username: string, role: string, action: 'promote' | 'demote') => {
    setActionLoading(username);
    try {
      const result = await usersApi.updateRole(username, role, action);
      // Update user in local state
      setUsers((prev) =>
        prev.map((u) =>
          u.username === username ? { ...u, groups: result.groups } : u
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setActionLoading(null);
    }
  };

  const wrestlerRequests = users.filter(
    (u) => u.wrestlerName && !u.groups.includes('Wrestler') && !u.groups.includes('Admin')
  );

  const filteredUsers = (() => {
    switch (activeFilter) {
      case 'wrestler-requests':
        return wrestlerRequests;
      case 'wrestlers':
        return users.filter((u) => u.groups.includes('Wrestler'));
      case 'admins':
        return users.filter((u) => u.groups.includes('Admin'));
      default:
        return users;
    }
  })();

  const getRoleBadges = (groups: string[]) => {
    return groups.map((group) => (
      <span key={group} className={`role-badge role-${group.toLowerCase()}`}>
        {group}
      </span>
    ));
  };

  if (loading) {
    return <div className="manage-users"><p>Loading users...</p></div>;
  }

  return (
    <div className="manage-users">
      <div className="users-header">
        <h2>User Management</h2>
        <button className="btn-refresh" onClick={fetchUsers}>
          Refresh
        </button>
      </div>

      {wrestlerRequests.length > 0 && (
        <div className="wrestler-requests-banner">
          <strong>{wrestlerRequests.length} wrestler request{wrestlerRequests.length !== 1 ? 's' : ''}</strong> pending approval
        </div>
      )}

      {error && (
        <div className="error-message" role="alert">
          {error}
          <button onClick={() => setError(null)} className="dismiss-btn">Dismiss</button>
        </div>
      )}

      <div className="filter-tabs">
        <button
          className={activeFilter === 'all' ? 'active' : ''}
          onClick={() => setActiveFilter('all')}
        >
          All Users ({users.length})
        </button>
        <button
          className={activeFilter === 'wrestler-requests' ? 'active' : ''}
          onClick={() => setActiveFilter('wrestler-requests')}
        >
          Wrestler Requests ({wrestlerRequests.length})
        </button>
        <button
          className={activeFilter === 'wrestlers' ? 'active' : ''}
          onClick={() => setActiveFilter('wrestlers')}
        >
          Wrestlers
        </button>
        <button
          className={activeFilter === 'admins' ? 'active' : ''}
          onClick={() => setActiveFilter('admins')}
        >
          Admins
        </button>
      </div>

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Wrestler Name</th>
              <th>Roles</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.username} className={user.wrestlerName && !user.groups.includes('Wrestler') && !user.groups.includes('Admin') ? 'wrestler-request-row' : ''}>
                <td>{user.email}</td>
                <td>
                  {user.wrestlerName ? (
                    <span className="wrestler-name">{user.wrestlerName}</span>
                  ) : (
                    <span className="no-value">-</span>
                  )}
                </td>
                <td className="roles-cell">
                  {user.groups.length > 0 ? getRoleBadges(user.groups) : (
                    <span className="no-value">No roles</span>
                  )}
                </td>
                <td>
                  <span className={`status-badge status-${user.status?.toLowerCase()}`}>
                    {user.status}
                  </span>
                </td>
                <td>{user.created ? new Date(user.created).toLocaleDateString() : '-'}</td>
                <td className="actions-cell">
                  {actionLoading === user.username ? (
                    <span className="action-loading">Updating...</span>
                  ) : (
                    <>
                      {/* Approve as Wrestler */}
                      {user.wrestlerName && !user.groups.includes('Wrestler') && !user.groups.includes('Admin') && (
                        <button
                          className="btn-action btn-approve"
                          onClick={() => handleRoleAction(user.username, 'Wrestler', 'promote')}
                          title="Approve as Wrestler"
                        >
                          Approve Wrestler
                        </button>
                      )}

                      {/* Promote to Wrestler (no wrestler name) */}
                      {!user.groups.includes('Wrestler') && !user.groups.includes('Admin') && !user.wrestlerName && (
                        <button
                          className="btn-action btn-promote"
                          onClick={() => handleRoleAction(user.username, 'Wrestler', 'promote')}
                          title="Promote to Wrestler"
                        >
                          Make Wrestler
                        </button>
                      )}

                      {/* Demote from Wrestler */}
                      {user.groups.includes('Wrestler') && !user.groups.includes('Admin') && (
                        <button
                          className="btn-action btn-demote"
                          onClick={() => handleRoleAction(user.username, 'Wrestler', 'demote')}
                          title="Remove Wrestler role"
                        >
                          Remove Wrestler
                        </button>
                      )}

                      {/* Promote to Admin */}
                      {!user.groups.includes('Admin') && (
                        <button
                          className="btn-action btn-promote-admin"
                          onClick={() => handleRoleAction(user.username, 'Admin', 'promote')}
                          title="Promote to Admin"
                        >
                          Make Admin
                        </button>
                      )}

                      {/* Demote from Admin */}
                      {user.groups.includes('Admin') && (
                        <button
                          className="btn-action btn-demote"
                          onClick={() => handleRoleAction(user.username, 'Admin', 'demote')}
                          title="Remove Admin role"
                        >
                          Remove Admin
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  No users found for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
