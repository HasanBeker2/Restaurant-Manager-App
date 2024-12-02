import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { Download, Trash2, Edit2 } from 'lucide-react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface SalesOrdersProps {
  logo: string;
  restaurantName: string;
}

interface SalesOrder {
  id: string;
  date: string;
  finishedProductId: string;
  finishedProductName: string;
  description: string;
  quantity: number;
  salePrice: number;
  totalPrice: number;
  status: string;
}

interface BOMAssembly {
  id: string;
  finishedProductName: string;
  salesDescription: string;
  salesPrice: number;
  assemblyItems: BOMAssemblyItem[];
}

interface BOMAssemblyItem {
  name: string;
  itemType: 'Raw Goods' | 'Other Costs';
  quantity: number;
  unitOfMeasure: string;
}

interface RawGood {
  id: string;
  name: string;
  qtyOnHand: number;
  unitOfMeasure: string;
}

const SalesOrders: React.FC<SalesOrdersProps> = ({ logo, restaurantName }) => {
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [newSalesOrder, setNewSalesOrder] = useState<Omit<SalesOrder, 'id' | 'totalPrice'>>({
    date: new Date().toISOString().split('T')[0],
    finishedProductId: '',
    finishedProductName: '',
    description: '',
    quantity: 0,
    salePrice: 0,
    status: 'Paid',
  });
  const [editingSalesOrder, setEditingSalesOrder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState<boolean | null>(null);
  const [bomAssemblies, setBOMAssemblies] = useState<BOMAssembly[]>([]);
  const [rawGoods, setRawGoods] = useState<RawGood[]>([]);

  const statusOptions = ['Faulty Production', 'Return', 'Cancelled', 'Paid'];

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserLoggedIn(true);
      } else {
        setUserLoggedIn(false);
        setLoading(false);
        setError('No user logged in. Please log in to view sales orders.');
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeSalesOrders: () => void;
    let unsubscribeBOMAssemblies: () => void;
    let unsubscribeRawGoods: () => void;

    const fetchData = async () => {
      if (!auth.currentUser) return;

      try {
        // Fetch Sales Orders
        const salesOrdersRef = collection(db, 'salesOrders');
        const q = query(salesOrdersRef, where('userId', '==', auth.currentUser.uid));

        unsubscribeSalesOrders = onSnapshot(q, (querySnapshot) => {
          const orders = querySnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as SalesOrder)
          );
          setSalesOrders(orders);
          setLoading(false);
        });

        // Fetch BOM Assemblies
        const bomAssembliesRef = collection(db, 'bomAssemblies');
        const bomAssembliesQuery = query(
          bomAssembliesRef,
          where('userId', '==', auth.currentUser.uid)
        );

        unsubscribeBOMAssemblies = onSnapshot(bomAssembliesQuery, (querySnapshot) => {
          const assemblies = querySnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as BOMAssembly)
          );
          setBOMAssemblies(assemblies);
        });

        // Fetch Raw Goods
        const rawGoodsRef = collection(db, 'rawGoods');
        const rawGoodsQuery = query(rawGoodsRef, where('userId', '==', auth.currentUser.uid));

        unsubscribeRawGoods = onSnapshot(rawGoodsQuery, (querySnapshot) => {
          const goods = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as RawGood));
          setRawGoods(goods);
        });
      } catch (error) {
        console.error('Error setting up listeners: ', error);
        setError('An error occurred while fetching data. Please try again.');
        setLoading(false);
      }
    };

    if (userLoggedIn) {
      fetchData();
    }

    return () => {
      if (unsubscribeSalesOrders) unsubscribeSalesOrders();
      if (unsubscribeBOMAssemblies) unsubscribeBOMAssemblies();
      if (unsubscribeRawGoods) unsubscribeRawGoods();
    };
  }, [userLoggedIn]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'finishedProductId') {
      const selectedProduct = bomAssemblies.find((assembly) => assembly.id === value);
      if (selectedProduct) {
        setNewSalesOrder((prev) => ({
          ...prev,
          finishedProductId: value,
          finishedProductName: selectedProduct.finishedProductName,
          description: selectedProduct.salesDescription,
          salePrice: selectedProduct.salesPrice,
        }));
      }
    } else {
      setNewSalesOrder((prev) => ({
        ...prev,
        [name]: name === 'quantity' ? parseInt(value) || 0 : value,
      }));
    }
  };

  const calculateTotalPrice = () => {
    return newSalesOrder.quantity * newSalesOrder.salePrice;
  };

  const updateRawGoodsInventory = async (salesOrder: SalesOrder) => {
    const selectedProduct = bomAssemblies.find(
      (assembly) => assembly.id === salesOrder.finishedProductId
    );
    if (!selectedProduct) return;

    for (const item of selectedProduct.assemblyItems) {
      if (item.itemType === 'Raw Goods') {
        const rawGood = rawGoods.find((good) => good.name === item.name);
        if (rawGood) {
          const newQuantity = rawGood.qtyOnHand - item.quantity * salesOrder.quantity;
          await updateDoc(doc(db, 'rawGoods', rawGood.id), { qtyOnHand: newQuantity });
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      const totalPrice = calculateTotalPrice();
      const salesOrderData = {
        ...newSalesOrder,
        totalPrice,
        userId: auth.currentUser.uid,
      };

      if (editingSalesOrder) {
        const salesOrderRef = doc(db, 'salesOrders', editingSalesOrder);
        await updateDoc(salesOrderRef, salesOrderData);
      } else {
        await addDoc(collection(db, 'salesOrders'), salesOrderData);
      }

      await updateRawGoodsInventory(salesOrderData as SalesOrder);

      setNewSalesOrder({
        date: new Date().toISOString().split('T')[0],
        finishedProductId: '',
        finishedProductName: '',
        description: '',
        quantity: 0,
        salePrice: 0,
        status: 'Paid',
      });
      setEditingSalesOrder(null);
    } catch (error) {
      console.error('Error adding/updating sales order: ', error);
      setError('Failed to save sales order. Please try again.');
    }
  };

  const handleEdit = (salesOrder: SalesOrder) => {
    setNewSalesOrder(salesOrder);
    setEditingSalesOrder(salesOrder.id);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'salesOrders', id));
    } catch (error) {
      console.error('Error deleting sales order: ', error);
      setError('Failed to delete sales order. Please try again.');
    }
  };

  const handleStatusClick = async (salesOrder: SalesOrder) => {
    const currentIndex = statusOptions.indexOf(salesOrder.status);
    const nextIndex = (currentIndex + 1) % statusOptions.length;
    const nextStatus = statusOptions[nextIndex];

    try {
      await updateDoc(doc(db, 'salesOrders', salesOrder.id), { status: nextStatus });
    } catch (error) {
      console.error('Error updating status: ', error);
      setError('Failed to update status. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Faulty Production':
        return 'bg-red-500';
      case 'Return':
        return 'bg-yellow-500';
      case 'Cancelled':
        return 'bg-gray-500';
      case 'Paid':
        return 'bg-green-500';
      default:
        return 'bg-blue-500';
    }
  };

  const downloadSalesOrdersList = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Sales Orders List', 14, 22);

    doc.setFontSize(12);
    doc.text(`${restaurantName}`, 14, 32);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 38);

    doc.autoTable({
      head: [
        [
          'Order ID',
          'Date',
          'Product',
          'Description',
          'Quantity',
          'Sale Price',
          'Total Price',
          'Status',
        ],
      ],
      body: salesOrders.map((order, index) => [
        index + 1,
        order.date,
        order.finishedProductName,
        order.description,
        order.quantity,
        `€${order.salePrice.toFixed(2)}`,
        `€${order.totalPrice.toFixed(2)}`,
        order.status,
      ]),
      startY: 45,
    });

    doc.save('sales_orders_list.pdf');
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">Please log in to view and manage sales orders.</p>
        ) : (
          <>
            <div className="bg-[#3b82f6] rounded-lg shadow-lg p-6 mb-6 w-full lg:w-1/2 mx-auto">
              <h2 className="text-xl font-semibold mb-4 text-white">
                {editingSalesOrder ? 'Edit Sales Order' : 'Add Sales Order'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="date" className="block text-sm font-medium text-white">
                      Date
                    </label>
                    <input
                      type="date"
                      id="date"
                      name="date"
                      value={newSalesOrder.date}
                      onChange={handleInputChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="finishedProductId"
                      className="block text-sm font-medium text-white"
                    >
                      Finished Product
                    </label>
                    <select
                      id="finishedProductId"
                      name="finishedProductId"
                      value={newSalesOrder.finishedProductId}
                      onChange={handleInputChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      required
                    >
                      <option value="">Select Product</option>
                      {bomAssemblies.map((assembly) => (
                        <option key={assembly.id} value={assembly.id}>
                          {assembly.finishedProductName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="quantity" className="block text-sm font-medium text-white">
                      Quantity
                    </label>
                    <input
                      type="number"
                      id="quantity"
                      name="quantity"
                      value={newSalesOrder.quantity}
                      onChange={handleInputChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium text-white">
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={newSalesOrder.status}
                      onChange={handleInputChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                      required
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="bg-white text-[#3b82f6] px-4 py-2 rounded hover:bg-gray-100"
                >
                  {editingSalesOrder ? 'Update Sales Order' : 'Add Sales Order'}
                </button>
              </form>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
              <h2 className="text-2xl font-semibold mb-4">Sales Orders List</h2>
              {loading ? (
                <p>Loading sales orders...</p>
              ) : error ? (
                <p className="text-red-500">{error}</p>
              ) : salesOrders.length === 0 ? (
                <p>No sales orders found. Create your first sales order above.</p>
              ) : (
                <table className="min-w-full bg-white">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-2 px-4 border-b text-left">Order ID</th>
                      <th className="py-2 px-4 border-b text-left">Date</th>
                      <th className="py-2 px-4 border-b text-left">Product</th>
                      <th className="py-2 px-4 border-b text-left">Quantity</th>
                      <th className="py-2 px-4 border-b text-left">Sale Price</th>
                      <th className="py-2 px-4 border-b text-left">Total Price</th>
                      <th className="py-2 px-4 border-b text-left">Status</th>
                      <th className="py-2 px-4 border-b text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesOrders.map((order, index) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="py-2 px-4 border-b">{index + 1}</td>
                        <td className="py-2 px-4 border-b">{order.date}</td>
                        <td className="py-2 px-4 border-b">{order.finishedProductName}</td>
                        <td className="py-2 px-4 border-b">{order.quantity}</td>
                        <td className="py-2 px-4 border-b">€{order.salePrice.toFixed(2)}</td>
                        <td className="py-2 px-4 border-b">€{order.totalPrice.toFixed(2)}</td>
                        <td className="py-2 px-4 border-b">
                          <button
                            className={`px-2 py-1 rounded text-white ${getStatusColor(order.status)}`}
                            onClick={() => handleStatusClick(order)}
                          >
                            {order.status}
                          </button>
                        </td>
                        <td className="py-2 px-4 border-b">
                          <button
                            onClick={() => handleEdit(order)}
                            className="text-blue-500 hover:text-blue-700 mr-2"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(order.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {salesOrders.length > 0 && (
                <button
                  onClick={downloadSalesOrdersList}
                  className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center"
                >
                  <Download size={18} className="mr-2" />
                  Download Sales Orders List (PDF)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default SalesOrders;
