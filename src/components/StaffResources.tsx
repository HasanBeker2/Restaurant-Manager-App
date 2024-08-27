import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { Download, Trash2 } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Add these type declarations
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: AutoTableOptions) => jsPDF;
  }
}

interface AutoTableOptions {
  head: string[][];
  body: (string | number)[][];
  startY?: number;
  [key: string]: any;
}

interface StaffResourcesProps {
  logo: string;
  restaurantName: string;
}

interface StaffMember {
  id: string;
  name: string;
  position: string;
  email: string;
  phone: string;
  address: string;
  zip: string;
  city: string;
}

const StaffResources: React.FC<StaffResourcesProps> = ({ logo, restaurantName }) => {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [newStaff, setNewStaff] = useState<Omit<StaffMember, 'id'>>({
    name: '',
    position: '',
    email: '',
    phone: '',
    address: '',
    zip: '',
    city: '',
  });
  const [editingStaff, setEditingStaff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserLoggedIn(true);
      } else {
        setUserLoggedIn(false);
        setLoading(false);
        setError("No user logged in. Please log in to view staff.");
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeStaff: () => void;

    const fetchStaff = async () => {
      if (!auth.currentUser) return;

      try {
        const staffRef = collection(db, 'staff');
        const q = query(staffRef, where("userId", "==", auth.currentUser.uid));

        unsubscribeStaff = onSnapshot(q, (querySnapshot) => {
          const staff = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StaffMember));
          setStaffList(staff);
          setLoading(false);
        }, (error) => {
          console.error("Error fetching staff: ", error);
          setError("Failed to fetch staff. Please try again.");
          setLoading(false);
        });
      } catch (error) {
        console.error("Error setting up staff listener: ", error);
        setError("An error occurred while setting up the staff list. Please try again.");
        setLoading(false);
      }
    };

    if (userLoggedIn) {
      fetchStaff();
    }

    return () => {
      if (unsubscribeStaff) {
        unsubscribeStaff();
      }
    };
  }, [userLoggedIn]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewStaff({ ...newStaff, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      if (editingStaff) {
        const staffRef = doc(db, 'staff', editingStaff);
        await updateDoc(staffRef, newStaff);
      } else {
        await addDoc(collection(db, 'staff'), {
          ...newStaff,
          userId: auth.currentUser.uid,
        });
      }

      setNewStaff({ name: '', position: '', email: '', phone: '', address: '', zip: '', city: '' });
      setEditingStaff(null);
    } catch (error) {
      console.error("Error adding/updating staff member: ", error);
      setError("Failed to save staff member. Please try again.");
    }
  };

  const handleEdit = (staff: StaffMember) => {
    setNewStaff(staff);
    setEditingStaff(staff.id);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'staff', id));
    } catch (error) {
      console.error("Error deleting staff member: ", error);
      setError("Failed to delete staff member. Please try again.");
    }
  };

  const downloadStaffList = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Staff List', 14, 22);

    doc.setFontSize(12);
    doc.text(`${restaurantName}`, 14, 32);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 38);

    doc.autoTable({
      head: [['#', 'Name', 'Position', 'Email', 'Phone', 'Address', 'ZIP', 'City']],
      body: staffList.map((staff, index) => [
        index + 1,
        staff.name,
        staff.position,
        staff.email,
        staff.phone,
        staff.address,
        staff.zip,
        staff.city
      ]),
      startY: 45,
    });

    doc.save('staff_list.pdf');
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">Please log in to view and manage staff.</p>
        ) : (
          <>
            <div className="max-w-4xl mx-auto">
              <div className="bg-blue-500 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-white">
                  {editingStaff !== null ? 'Edit' : 'Add New'} Staff Member
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      name="name"
                      value={newStaff.name}
                      onChange={handleInputChange}
                      placeholder="Name"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="text"
                      name="position"
                      value={newStaff.position}
                      onChange={handleInputChange}
                      placeholder="Position"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="email"
                      name="email"
                      value={newStaff.email}
                      onChange={handleInputChange}
                      placeholder="Email"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="tel"
                      name="phone"
                      value={newStaff.phone}
                      onChange={handleInputChange}
                      placeholder="Phone"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <input
                      type="text"
                      name="address"
                      value={newStaff.address}
                      onChange={handleInputChange}
                      placeholder="Address"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="text"
                      name="zip"
                      value={newStaff.zip}
                      onChange={handleInputChange}
                      placeholder="ZIP"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="text"
                      name="city"
                      value={newStaff.city}
                      onChange={handleInputChange}
                      placeholder="City"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                  </div>
                  <button type="submit" className="bg-white text-blue-500 px-6 py-2 rounded hover:bg-blue-100 text-sm font-medium">
                    {editingStaff !== null ? 'Update' : 'Add'} Staff Member
                  </button>
                </form>
              </div>
            </div>

            <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
              <h2 className="text-2xl font-semibold mb-4">Staff List</h2>
              {loading ? (
                <p>Loading staff...</p>
              ) : error ? (
                <p className="text-red-500">{error}</p>
              ) : staffList.length === 0 ? (
                <p>No staff members found. Add your first staff member above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-2 px-4 border-b">#</th>
                        <th className="py-2 px-4 border-b">Name</th>
                        <th className="py-2 px-4 border-b">Position</th>
                        <th className="py-2 px-4 border-b">Email</th>
                        <th className="py-2 px-4 border-b">Phone</th>
                        <th className="py-2 px-4 border-b">Address</th>
                        <th className="py-2 px-4 border-b">ZIP</th>
                        <th className="py-2 px-4 border-b">City</th>
                        <th className="py-2 px-4 border-b">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.map((staff, index) => (
                        <tr key={staff.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleEdit(staff)}>
                          <td className="py-2 px-4 border-b text-center">{index + 1}</td>
                          <td className="py-2 px-4 border-b text-center">{staff.name}</td>
                          <td className="py-2 px-4 border-b text-center">{staff.position}</td>
                          <td className="py-2 px-4 border-b text-center">{staff.email}</td>
                          <td className="py-2 px-4 border-b text-center">{staff.phone}</td>
                          <td className="py-2 px-4 border-b text-center">{staff.address}</td>
                          <td className="py-2 px-4 border-b text-center">{staff.zip}</td>
                          <td className="py-2 px-4 border-b text-center">{staff.city}</td>
                          <td className="py-2 px-4 border-b text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(staff.id);
                              }}
                              className="text-red-500 hover:text-red-700"
                              title="Delete"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {staffList.length > 0 && (
                <button
                  onClick={downloadStaffList}
                  className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center"
                >
                  <Download size={18} className="mr-2" />
                  Download Staff List (PDF)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default StaffResources;