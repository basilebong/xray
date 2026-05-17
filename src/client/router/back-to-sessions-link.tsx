import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "../components/ui/button.tsx";

export function BackToSessionsLink() {
	return (
		<Link to="/">
			<Button variant="ghost" size="sm">
				<ArrowLeft />
				All sessions
			</Button>
		</Link>
	);
}
