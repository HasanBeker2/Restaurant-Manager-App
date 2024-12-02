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

interface SuppliersProps {
  logo: string;
  restaurantName: string;
}

interface Supplier {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
}

const Suppliers: React.FC<SuppliersProps> = ({ logo, restaurantName }) => {
  const [supplierList, setSupplierList] = useState<Supplier[]>([]);
  const [newSupplier, setNewSupplier] = useState<Omit<Supplier, 'id'>>({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    email: '',
  });
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
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
        setError("No user logged in. Please log in to view suppliers.");
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeSuppliers: () => void;

    const fetchSuppliers = async () => {
      if (!auth.currentUser) return;

      try {
        const suppliersRef = collection(db, 'suppliers');
        const q = query(suppliersRef, where("userId", "==", auth.currentUser.uid));

        unsubscribeSuppliers = onSnapshot(q, (querySnapshot) => {
          const suppliers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
          setSupplierList(suppliers);
          setLoading(false);
        }, (error) => {
          console.error("Error fetching suppliers: ", error);
          setError("Failed to fetch suppliers. Please try again.");
          setLoading(false);
        });
      } catch (error) {
        console.error("Error setting up suppliers listener: ", error);
        setError("An error occurred while setting up the suppliers list. Please try again.");
        setLoading(false);
      }
    };

    if (userLoggedIn) {
      fetchSuppliers();
    }

    return () => {
      if (unsubscribeSuppliers) {
        unsubscribeSuppliers();
      }
    };
  }, [userLoggedIn]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewSupplier({ ...newSupplier, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      if (editingSupplier) {
        const supplierRef = doc(db, 'suppliers', editingSupplier);
        await updateDoc(supplierRef, newSupplier);
      } else {
        await addDoc(collection(db, 'suppliers'), {
          ...newSupplier,
          userId: auth.currentUser.uid,
        });
      }

      setNewSupplier({ name: '', address: '', city: '', state: '', zip: '', phone: '', email: '' });
      setEditingSupplier(null);
    } catch (error) {
      console.error("Error adding/updating supplier: ", error);
      setError("Failed to save supplier. Please try again.");
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setNewSupplier(supplier);
    setEditingSupplier(supplier.id);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'suppliers', id));
    } catch (error) {
      console.error("Error deleting supplier: ", error);
      setError("Failed to delete supplier. Please try again.");
    }
  };

  const downloadSupplierList = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Supplier List', 14, 22);

    doc.setFontSize(12);
    doc.text(`${restaurantName}`, 14, 32);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 38);

    doc.autoTable({
      head: [['Supp ID', 'Supplier Name', 'Address', 'City', 'State', 'ZIP', 'Phone', 'Email']],
      body: supplierList.map((supplier, index) => [
        index + 1,
        supplier.name,
        supplier.address,
        supplier.city,
        supplier.state,
        supplier.zip,
        supplier.phone,
        supplier.email
      ]),
      startY: 45,
    });

    doc.save('supplier_list.pdf');
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">Please log in to view and manage suppliers.</p>
        ) : (
          <>
            <div className="max-w-4xl mx-auto">
              <div className="bg-blue-500 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-white">
                  {editingSupplier !== null ? 'Edit' : 'Add New'} Supplier
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      name="name"
                      value={newSupplier.name}
                      onChange={handleInputChange}
                      placeholder="Supplier Name"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="text"
                      name="address"
                      value={newSupplier.address}
                      onChange={handleInputChange}
                      placeholder="Address"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="text"
                      name="city"
                      value={newSupplier.city}
                      onChange={handleInputChange}
                      placeholder="City"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="text"
                      name="state"
                      value={newSupplier.state}
                      onChange={handleInputChange}
                      placeholder="State"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <input
                      type="text"
                      name="zip"
                      value={newSupplier.zip}
                      onChange={handleInputChange}
                      placeholder="ZIP"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="tel"
                      name="phone"
                      value={newSupplier.phone}
                      onChange={handleInputChange}
                      placeholder="Phone"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="email"
                      name="email"
                      value={newSupplier.email}
                      onChange={handleInputChange}
                      placeholder="Email"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                  </div>
                  <button type="submit" className="bg-white text-blue-500 px-6 py-2 rounded hover:bg-blue-100 text-sm font-medium">
                    {editingSupplier !== null ? 'Update' : 'Add'} Supplier
                  </button>
                </form>
              </div>
            </div>

            <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
              <h2 className="text-2xl font-semibold mb-4">Supplier List</h2>
              {loading ? (
                <p>Loading suppliers...</p>
              ) : error ? (
                <p className="text-red-500">{error}</p>
              ) : supplierList.length === 0 ? (
                <p>No suppliers found. Add your first supplier above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-2 px-4 border-b">Supp ID</th>
                        <th className="py-2 px-4 border-b">Supplier Name</th>
                        <th className="py-2 px-4 border-b">Address</th>
                        <th className="py-2 px-4 border-b">City</th>
                        <th className="py-2 px-4 border-b">State</th>
                        <th className="py-2 px-4 border-b">ZIP</th>
                        <th className="py-2 px-4 border-b">Phone</th>
                        <th className="py-2 px-4 border-b">Email</th>
                        <th className="py-2 px-4 border-b">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierList.map((supplier, index) => (
                        <tr key={supplier.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleEdit(supplier)}>
                          <td className="py-2 px-4 border-b text-center">{index + 1}</td>
                          <td className="py-2 px-4 border-b text-center">{supplier.name}</td>
                          <td className="py-2 px-4 border-b text-center">{supplier.address}</td>
                          <td className="py-2 px-4 border-b text-center">{supplier.city}</td>
                          <td className="py-2 px-4 border-b text-center">{supplier.state}</td>
                          <td className="py-2 px-4 border-b text-center">{supplier.zip}</td>
                          <td className="py-2 px-4 border-b text-center">{supplier.phone}</td>
                          <td className="py-2 px-4 border-b text-center">{supplier.email}</td>
                          <td className="py-2 px-4 border-b text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(supplier.id);
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
              {supplierList.length > 0 && (
                <button
                  onClick={downloadSupplierList}
                  className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center"
                >
                  <Download size={18} className="mr-2" />
                  Download Supplier List (PDF)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default Suppliers;