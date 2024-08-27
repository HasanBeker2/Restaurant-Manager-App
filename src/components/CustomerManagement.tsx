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

interface CustomerManagementProps {
  logo: string;
  restaurantName: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  zip: string;
  city: string;
  loyaltyPoints: number;
}

const CustomerManagement: React.FC<CustomerManagementProps> = ({ logo, restaurantName }) => {
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [newCustomer, setNewCustomer] = useState<Omit<Customer, 'id'>>({
    name: '',
    email: '',
    phone: '',
    address: '',
    zip: '',
    city: '',
    loyaltyPoints: 0,
  });
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
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
        setError("No user logged in. Please log in to view customers.");
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeCustomers: () => void;

    const fetchCustomers = async () => {
      if (!auth.currentUser) return;

      try {
        const customersRef = collection(db, 'customers');
        const q = query(customersRef, where("userId", "==", auth.currentUser.uid));

        unsubscribeCustomers = onSnapshot(q, (querySnapshot) => {
          const customers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
          setCustomerList(customers);
          setLoading(false);
        }, (error) => {
          console.error("Error fetching customers: ", error);
          setError("Failed to fetch customers. Please try again.");
          setLoading(false);
        });
      } catch (error) {
        console.error("Error setting up customer listener: ", error);
        setError("An error occurred while setting up the customer list. Please try again.");
        setLoading(false);
      }
    };

    if (userLoggedIn) {
      fetchCustomers();
    }

    return () => {
      if (unsubscribeCustomers) {
        unsubscribeCustomers();
      }
    };
  }, [userLoggedIn]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.name === 'loyaltyPoints' ? parseInt(e.target.value) : e.target.value;
    setNewCustomer({ ...newCustomer, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      if (editingCustomer) {
        const customerRef = doc(db, 'customers', editingCustomer);
        await updateDoc(customerRef, newCustomer);
      } else {
        await addDoc(collection(db, 'customers'), {
          ...newCustomer,
          userId: auth.currentUser.uid,
        });
      }

      setNewCustomer({ name: '', email: '', phone: '', address: '', zip: '', city: '', loyaltyPoints: 0 });
      setEditingCustomer(null);
    } catch (error) {
      console.error("Error adding/updating customer: ", error);
      setError("Failed to save customer. Please try again.");
    }
  };

  const handleEdit = (customer: Customer) => {
    setNewCustomer(customer);
    setEditingCustomer(customer.id);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'customers', id));
    } catch (error) {
      console.error("Error deleting customer: ", error);
      setError("Failed to delete customer. Please try again.");
    }
  };

  const downloadCustomerList = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Customer List', 14, 22);

    doc.setFontSize(12);
    doc.text(`${restaurantName}`, 14, 32);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 38);

    doc.autoTable({
      head: [['#', 'Name', 'Email', 'Phone', 'Address', 'ZIP', 'City', 'Loyalty Points']],
      body: customerList.map((customer, index) => [
        index + 1,
        customer.name,
        customer.email,
        customer.phone,
        customer.address,
        customer.zip,
        customer.city,
        customer.loyaltyPoints.toString()
      ]),
      startY: 45,
    });

    doc.save('customer_list.pdf');
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">Please log in to view and manage customers.</p>
        ) : (
          <>
            <div className="max-w-4xl mx-auto">
              <div className="bg-blue-500 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-white">
                  {editingCustomer !== null ? 'Edit' : 'Add New'} Customer
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      name="name"
                      value={newCustomer.name}
                      onChange={handleInputChange}
                      placeholder="Name"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="email"
                      name="email"
                      value={newCustomer.email}
                      onChange={handleInputChange}
                      placeholder="Email"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="tel"
                      name="phone"
                      value={newCustomer.phone}
                      onChange={handleInputChange}
                      placeholder="Phone"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="text"
                      name="address"
                      value={newCustomer.address}
                      onChange={handleInputChange}
                      placeholder="Address"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <input
                      type="text"
                      name="zip"
                      value={newCustomer.zip}
                      onChange={handleInputChange}
                      placeholder="ZIP"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="text"
                      name="city"
                      value={newCustomer.city}
                      onChange={handleInputChange}
                      placeholder="City"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                    <input
                      type="number"
                      name="loyaltyPoints"
                      value={newCustomer.loyaltyPoints}
                      onChange={handleInputChange}
                      placeholder="Loyalty Points"
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                  </div>
                  <button type="submit" className="bg-white text-blue-500 px-6 py-2 rounded hover:bg-blue-100 text-sm font-medium">
                    {editingCustomer !== null ? 'Update' : 'Add'} Customer
                  </button>
                </form>
              </div>
            </div>

            <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
              <h2 className="text-2xl font-semibold mb-4">Customer List</h2>
              {loading ? (
                <p>Loading customers...</p>
              ) : error ? (
                <p className="text-red-500">{error}</p>
              ) : customerList.length === 0 ? (
                <p>No customers found. Add your first customer above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-2 px-4 border-b">#</th>
                        <th className="py-2 px-4 border-b">Name</th>
                        <th className="py-2 px-4 border-b">Email</th>
                        <th className="py-2 px-4 border-b">Phone</th>
                        <th className="py-2 px-4 border-b">Address</th>
                        <th className="py-2 px-4 border-b">ZIP</th>
                        <th className="py-2 px-4 border-b">City</th>
                        <th className="py-2 px-4 border-b">Loyalty Points</th>
                        <th className="py-2 px-4 border-b">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerList.map((customer, index) => (
                        <tr key={customer.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleEdit(customer)}>
                          <td className="py-2 px-4 border-b text-center">{index + 1}</td>
                          <td className="py-2 px-4 border-b text-center">{customer.name}</td>
                          <td className="py-2 px-4 border-b text-center">{customer.email}</td>
                          <td className="py-2 px-4 border-b text-center">{customer.phone}</td>
                          <td className="py-2 px-4 border-b text-center">{customer.address}</td>
                          <td className="py-2 px-4 border-b text-center">{customer.zip}</td>
                          <td className="py-2 px-4 border-b text-center">{customer.city}</td>
                          <td className="py-2 px-4 border-b text-center">{customer.loyaltyPoints}</td>
                          <td className="py-2 px-4 border-b text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(customer.id);
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
              {customerList.length > 0 && (
                <button
                  onClick={downloadCustomerList}
                  className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center"
                >
                  <Download size={18} className="mr-2" />
                  Download Customer List (PDF)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default CustomerManagement;