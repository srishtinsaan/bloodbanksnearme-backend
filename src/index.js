import connectDB from "./db/index.js";
import dotenv from "dotenv"
import {app} from './app.js'


dotenv.config({path : '../.env'})

connectDB()
// .then(() => {
//     app.on("error", (error) => {
//         console.log("ERROR ::", error);
//         throw error
//     })
    // app.listen(process.env.PORT || 8000, () => {
    //     console.log(`server is running at port : 
    //         ${process.env.PORT}`);
        
    // })
    

// })
.catch((error) => {
    console.log("MONGODB Connection FAILED !!!", error);
    
})

export default app;

