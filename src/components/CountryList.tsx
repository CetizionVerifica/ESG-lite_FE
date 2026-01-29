import { useEffect, useState } from "react"
import { Table, Column } from "./Table"
import { updateCountry } from "../services/countryService"

interface Country {
    country_id: number
    name: string
    code: string
}

const CountryList = ({ list }: { list?: Country[] }) => {
    const [data, setData] = useState<Country[]>(list || [])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (list) {
            setData(list)
        }
    }, [list])

    const handleEdit = async (row: Country, updates: Partial<Country>) => {
        try {
            setLoading(true)
            await updateCountry(row.country_id, updates)
            setData((prev) =>
                prev.map((item) =>
                    item.country_id === row.country_id
                        ? { ...item, ...updates }
                        : item
                )
            )
        } catch (error) {
            console.error("Error updating country:", error)
            throw error
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (row: Country) => {
        try {
            setLoading(true)
            // Call your API to delete
            // await deleteCountry(row.country_id)
            setData((prev) => prev.filter((item) => item.country_id !== row.country_id))
        } catch (error) {
            console.error("Error deleting country:", error)
            throw error
        } finally {
            setLoading(false)
        }
    }

    const columns: Column<Country>[] = [
        {
            key: "country_id",
            label: "ID",
            editable: false,
        },
        {
            key: "name",
            label: "Country Name",
            editable: true,
            type: "text",
        },
        {
            key: "code",
            label: "Country Code",
            editable: true,
            type: "text",
        },
    ]

    return (
        <Table<Country>
            data={data}
            columns={columns}
            keyField="country_id"
            onEdit={handleEdit}
            onDelete={handleDelete}
            loading={loading}
            showActions={true}
        />
    )
}

export default CountryList