import { useState, useEffect, useCallback } from 'react';

/**
 * usePeople - Unified hook to fetch members and staff across Auxwall apps.
 * 
 * @param {Object} options
 * @param {string} options.apiBaseUrl - The base URL of the API (including /api)
 * @param {string|number} options.companyId - The current company ID
 * @param {string} options.accessToken - JWT access token for headers
 * @param {Object} [options.trainer] - Optional trainer object { id } to filter members
 */
export default function usePeople({ apiBaseUrl, companyId, accessToken, trainer, search }) {
  const [members, setMembers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPeople = useCallback(async () => {
    if (!apiBaseUrl || !companyId || !accessToken) {
        setLoading(false);
        return;
    }

    try {
      setLoading(true);
      setError(null);

      const fetchOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `bearer ${accessToken}`,
        }
      };

      // Ensure apiBaseUrl ends with /api
      const baseApi = apiBaseUrl?.endsWith('/api') ? apiBaseUrl : `${apiBaseUrl}/api`;

      // 1. Fetch Members
      let mList = [];
      if (search && search.trim().length > 0) {
        const memberUrl = `${baseApi}/client_list_under_company/${companyId}?limit=100&search=[${encodeURIComponent(search)}]`;
        
        const membersRes = await fetch(memberUrl, fetchOptions);
        const membersData = await membersRes.json();
        const mData = membersData?.data || membersData || [];
        
        mList = Array.isArray(mData) ? mData.map((m) => ({
          id: m.clients?.id || m.clientId || m.id,
          name: m.clients?.fullName || m.fullName || 'Member',
          image: m.clients?.photo || m.imageURL || m.photo,
          userType: 'member'
        })) : [];
      }

      // 2. Fetch Staff
      let sList = staff;
      if (staff.length === 0) {
        const staffUrl = `${baseApi}/user/${companyId}?userName=true&ignoreCompanyId=true`;
        const staffRes = await fetch(staffUrl, fetchOptions);
        const staffData = await staffRes.json();
        const sData = staffData?.data || staffData || [];
        
        sList = Array.isArray(sData) ? sData.map((s) => ({
          id: s.id,
          name: s.fullName || s.userName || 'Staff',
          image: s.imageURL,
          userType: 'staff'
        })) : [];
      }

      setMembers(mList);
      setStaff(sList);
    } catch (err) {
      console.error('Failed to fetch people:', err);
      setError(err.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, companyId, accessToken, trainer?.id, search]);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  return {
    members,
    staff,
    loading,
    error,
    refresh: fetchPeople
  };
}
